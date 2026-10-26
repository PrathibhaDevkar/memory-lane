// Progress while a live kit builds. The page asks /api/kit for newline-delimited JSON, so each Qloo
// lookup and Claude call shows as it happens; the last line carries the same status and body the
// plain JSON answer would. Anything that doesn't ask for the stream (the smoke check, curl) gets
// plain JSON with the audit in the response headers, as before.
//
// The events hold nothing the kit's own trace doesn't already show this browser.

import { z } from "zod";
import { TraceStepSchema, type TraceStep } from "./types";

export const NDJSON = "application/x-ndjson";

/** What the agent is doing while nothing has finished yet: looking things up, or Claude choosing. */
export const BuildPhaseSchema = z.enum(["lookups", "choosing"]);

/** A trace step as the progress panel needs it: everything but the lookup's input. */
export const ProgressStepSchema = TraceStepSchema.omit({ input: true });

export const BuildEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("phase"), phase: BuildPhaseSchema }),
  z.object({ type: z.literal("step"), step: ProgressStepSchema }),
  z.object({ type: z.literal("result"), status: z.number().int(), body: z.unknown(), audit: z.record(z.string(), z.string()).optional() }),
]);

export type BuildPhase = z.infer<typeof BuildPhaseSchema>;
export type ProgressStep = z.infer<typeof ProgressStepSchema>;
export type BuildEvent = z.infer<typeof BuildEventSchema>;
export type ProgressEvent = Exclude<BuildEvent, { type: "result" }>;

export const progressStep = (s: TraceStep): ProgressStep => ({
  id: s.id,
  kind: s.kind,
  label: s.label,
  outputSummary: s.outputSummary,
  excluded: s.excluded,
  ms: s.ms,
  status: s.status,
});

/** True when the caller asked for progress (the page does; the smoke check doesn't). */
export const wantsProgress = (request: Request) => request.headers.get("accept")?.includes(NDJSON) ?? false;

/** The answer /api/kit gives: a status, a JSON body, and for live kits the audit headers. */
export type KitAnswer = { status: number; body: unknown; headers?: Record<string, string> };

/**
 * Streams a live build: progress events as they happen, then the answer. If the page goes away
 * the build still finishes, so its tokens are logged and counted as usual.
 */
export function progressResponse(build: (onProgress: (event: ProgressEvent) => void) => Promise<KitAnswer>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: BuildEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The page closed the connection.
        }
      };
      const answer = await build(send);
      send({ type: "result", status: answer.status, body: answer.body, audit: answer.headers });
      try {
        controller.close();
      } catch {
        // Already closed by the page.
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": `${NDJSON}; charset=utf-8`,
      // Sent as it's written: no caching, no compression or proxy buffering holding events back.
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/**
 * Reads /api/kit's answer, streamed or not, and returns its status and body. Progress events go to
 * onProgress as they arrive. Throws if a stream ends before its answer (the connection dropped).
 */
export async function readKitResponse(res: Response, onProgress: (event: ProgressEvent) => void): Promise<{ status: number; body: unknown }> {
  if (!res.headers.get("content-type")?.includes(NDJSON) || !res.body) {
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  // TextDecoder rather than TextDecoderStream, which older tablets' browsers lack.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    for (let newline = buffered.indexOf("\n"); newline >= 0; newline = buffered.indexOf("\n")) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      const event = line ? parseEvent(line) : null;
      if (!event) continue;
      if (event.type === "result") {
        await reader.cancel().catch(() => {});
        return { status: event.status, body: event.body };
      }
      onProgress(event);
    }
  }
  throw new StreamEndedError();
}

export class StreamEndedError extends Error {
  constructor() {
    super("The connection closed before the kit arrived.");
    this.name = "StreamEndedError";
  }
}

function parseEvent(line: string): BuildEvent | null {
  try {
    const parsed = BuildEventSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
