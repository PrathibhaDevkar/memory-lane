import { describe, expect, it, vi } from "vitest";
import { NDJSON, progressResponse, progressStep, readKitResponse, StreamEndedError, type ProgressEvent } from "@/lib/kit-stream";
import type { TraceStep } from "@/lib/types";

// The stream /api/kit sends the page while a live kit builds, and the reader on the page.

const step: TraceStep = {
  id: "t1",
  kind: "tool",
  label: "get_screen(movie)",
  input: { seed_ids: ["f1"], kind: "movie" },
  outputSummary: "12 returned for 1952–1972, 2 excluded, 6 offered",
  excluded: [{ title: "Patton", reason: "War genre" }],
  ms: 640,
  status: "ok",
};

/** A response whose body arrives in the given chunks, as a slow network would deliver it. */
function streamed(chunks: string[], type = `${NDJSON}; charset=utf-8`) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": type } });
}

describe("readKitResponse", () => {
  it("reads plain JSON as before", async () => {
    const res = Response.json({ error: "Too many kits." }, { status: 429 });
    const onProgress = vi.fn();
    expect(await readKitResponse(res, onProgress)).toEqual({ status: 429, body: { error: "Too many kits." } });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("passes progress on in order and returns the answer, even when lines are split across chunks", async () => {
    const lines = [
      JSON.stringify({ type: "phase", phase: "lookups" }),
      JSON.stringify({ type: "step", step: progressStep(step) }),
      JSON.stringify({ type: "phase", phase: "choosing" }),
      JSON.stringify({ type: "result", status: 200, body: { mode: "memory_lane" } }),
    ].join("\n");
    const chunks = [lines.slice(0, 10), lines.slice(10, 95), lines.slice(95, 96), lines.slice(96), "\n"];
    const seen: ProgressEvent[] = [];
    const answer = await readKitResponse(streamed(chunks), (e) => seen.push(e));
    expect(answer).toEqual({ status: 200, body: { mode: "memory_lane" } });
    expect(seen.map((e) => (e.type === "phase" ? e.phase : e.step.label))).toEqual(["lookups", "get_screen(movie)", "choosing"]);
  });

  it("skips lines it can't read", async () => {
    const seen: ProgressEvent[] = [];
    const answer = await readKitResponse(
      streamed(["not json\n", '{"type":"surprise"}\n', '{"type":"phase","phase":"lookups"}\n', '{"type":"result","status":502,"body":{"error":"x"}}\n']),
      (e) => seen.push(e),
    );
    expect(seen).toEqual([{ type: "phase", phase: "lookups" }]);
    expect(answer.status).toBe(502);
  });

  it("says so when the stream ends before the answer", async () => {
    await expect(readKitResponse(streamed(['{"type":"phase","phase":"lookups"}\n']), () => {})).rejects.toBeInstanceOf(StreamEndedError);
  });
});

describe("progressResponse", () => {
  it("streams each event as it happens, then the answer with the audit", async () => {
    const res = progressResponse(async (onProgress) => {
      onProgress({ type: "phase", phase: "lookups" });
      onProgress({ type: "step", step: progressStep(step) });
      return { status: 200, body: { mode: "memory_lane" }, headers: { "X-Claude-Calls": "1" } };
    });
    expect(res.headers.get("content-type")).toContain(NDJSON);
    expect(res.headers.get("cache-control")).toContain("no-transform");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { type: "phase", phase: "lookups" },
      { type: "step", step: progressStep(step) },
      { type: "result", status: 200, body: { mode: "memory_lane" }, audit: { "X-Claude-Calls": "1" } },
    ]);
  });

  it("sends a step without the lookup's input", () => {
    expect(progressStep(step)).not.toHaveProperty("input");
    expect(progressStep(step)).toMatchObject({ label: "get_screen(movie)", excluded: [{ title: "Patton" }] });
  });
});
