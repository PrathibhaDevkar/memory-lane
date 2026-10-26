import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

// /api/kit streams a live build's progress when the page asks for it, and answers plain JSON
// otherwise. The safety stop, limits and saved kits never stream.

const buildLiveKit = vi.fn();
vi.mock("@/lib/agent/run", () => ({ buildLiveKit: (...args: unknown[]) => buildLiveKit(...args) }));
const liveKitBlocked = vi.fn(async (): Promise<string | null> => null);
vi.mock("@/lib/ratelimit", () => ({ liveKitBlocked: () => liveKitBlocked(), isSmokeRequest: () => false }));
vi.mock("@/lib/kit-cache", () => ({ reusedExampleKit: async () => null, saveExampleKit: async () => {} }));

const { POST } = await import("@/app/api/kit/route");
const { KitSchema } = await import("@/lib/types");
const { NDJSON } = await import("@/lib/kit-stream");
const rosaKit = KitSchema.parse((await import("@/fixtures/kits/rosa.json")).default);

const walt = {
  suddenChange: false,
  supportLevel: "middle",
  displayName: "Walt",
  birthYear: 1950,
  hometown: "Memphis",
  favorites: [{ text: "Elvis Presley", kind: "artist" }],
  thingsToAvoid: ["war films"],
};
const post = (profile: object, accept = `${NDJSON}, application/json`) =>
  POST(new Request("http://localhost/api/kit", { method: "POST", body: JSON.stringify(profile), headers: { "content-type": "application/json", accept } }));
const lines = async (res: Response) =>
  (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

const step = { id: "t1", kind: "tool", label: "resolve_favorite", input: { name: "Elvis Presley" }, outputSummary: '"Elvis Presley" → Elvis Presley', excluded: [], ms: 300, status: "ok" };
const llm = { id: "t2", kind: "llm", label: "Claude, turn 1", input: { model: "claude-haiku-5-5", effort: "medium", usage: { in: 1800, cacheWrite: 0, cacheRead: 2550, out: 2300 } }, outputSummary: "Asked for: submit_kit", excluded: [], ms: 9000, status: "ok" };

describe("POST /api/kit with progress", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    buildLiveKit.mockReset();
    liveKitBlocked.mockReset();
    liveKitBlocked.mockResolvedValue(null);
  });

  it("streams each step as the agent reports it, then the kit with its audit", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    const quiet = vi.spyOn(console, "log").mockImplementation(() => {});
    buildLiveKit.mockImplementation(async (_profile, opts: { onProgress?: (e: unknown) => void }) => {
      opts.onProgress?.({ type: "phase", phase: "lookups" });
      opts.onProgress?.({ type: "step", step });
      opts.onProgress?.({ type: "phase", phase: "choosing" });
      return { ...rosaKit, trace: [...rosaKit.trace, llm], provenance: { kind: "live", generatedAt: "2026-10-26T10:00:00.000Z" } };
    });
    const res = await post(walt);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(NDJSON);
    const events = await lines(res);
    expect(events.slice(0, 3)).toEqual([
      { type: "phase", phase: "lookups" },
      { type: "step", step },
      { type: "phase", phase: "choosing" },
    ]);
    const result = events.at(-1);
    expect(result).toMatchObject({ type: "result", status: 200, audit: { "X-Claude-Calls": "1", "X-Kit-Audit": expect.any(String) } });
    expect(KitSchema.safeParse(result.body).success).toBe(true);
    quiet.mockRestore();
  });

  it("puts a failed build's message in the answer", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    buildLiveKit.mockRejectedValue(new Anthropic.APIError(500, { type: "error" }, "boom", new Headers()));
    const events = await lines(await post(walt));
    expect(events.at(-1)).toEqual({ type: "result", status: 502, body: { error: "Claude couldn't build the kit." } });
    quiet.mockRestore();
  });

  it("answers plain JSON, with the audit headers, when progress isn't asked for (the smoke check)", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    const quiet = vi.spyOn(console, "log").mockImplementation(() => {});
    buildLiveKit.mockResolvedValue({ ...rosaKit, trace: [...rosaKit.trace, llm], provenance: { kind: "live", generatedAt: "2026-10-26T10:00:00.000Z" } });
    const res = await post(walt, "application/json");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("X-Claude-Calls")).toBe("1");
    expect(KitSchema.safeParse(await res.json()).success).toBe(true);
    expect(buildLiveKit.mock.calls[0][1]).toEqual({ onProgress: undefined });
    quiet.mockRestore();
  });

  it("never streams the safety stop, a limit, or a saved kit", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    const stop = await post({ ...walt, suddenChange: true });
    expect(stop.headers.get("content-type")).toContain("application/json");
    expect((await stop.json()).mode).toBe("safety_stop");

    liveKitBlocked.mockResolvedValue("You've built 3 kits in the last hour.");
    const limited = await post(walt);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("content-type")).toContain("application/json");

    vi.stubEnv("KIT_SOURCE", "fixture");
    const saved = await post(walt);
    expect(saved.headers.get("content-type")).toContain("application/json");
    expect(buildLiveKit).not.toHaveBeenCalled();
  });
});
