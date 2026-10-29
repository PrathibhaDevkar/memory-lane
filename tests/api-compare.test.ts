import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/compare, with the comparison, limits and cache stood in for.

class ComparisonRefusedError extends Error {}
const buildComparison = vi.fn();
vi.mock("@/lib/compare", () => ({ buildComparison: (...args: unknown[]) => buildComparison(...args), ComparisonRefusedError }));
const liveKitBlocked = vi.fn(async (): Promise<string | null> => null);
const isSmokeRequest = vi.fn((): boolean => false);
vi.mock("@/lib/ratelimit", () => ({
  liveKitBlocked: (...args: unknown[]) => liveKitBlocked(...(args as [])),
  isSmokeRequest: (...args: unknown[]) => isSmokeRequest(...(args as [])),
}));
const reusedExampleComparison = vi.fn(async (): Promise<unknown> => null);
const saveExampleComparison = vi.fn(async () => {});
vi.mock("@/lib/kit-cache", () => ({
  reusedExampleComparison: (...args: unknown[]) => reusedExampleComparison(...(args as [])),
  saveExampleComparison: (...args: unknown[]) => saveExampleComparison(...(args as [])),
}));
const captured: { event: string; properties: Record<string, unknown> }[] = [];
vi.mock("@/lib/analytics/server", async (original) => ({
  ...(await original<typeof import("@/lib/analytics/server")>()),
  captureAfterResponse: (event: string, properties: Record<string, unknown>) => captured.push({ event, properties }),
}));

const { POST } = await import("@/app/api/compare/route");
const { ComparisonSchema } = await import("@/lib/types");

const post = (body: string) => POST(new Request("http://localhost/api/compare", { method: "POST", body, headers: { "content-type": "application/json" } }));

const rosa = {
  suddenChange: false,
  displayName: "Rosa",
  supportLevel: "early",
  birthYear: 1942,
  hometown: "Chicago",
  favorites: [{ text: "Frank Sinatra", kind: "artist" }],
  thingsToAvoid: ["none"],
};

const comparison = ComparisonSchema.parse({
  mode: "comparison",
  provenance: { kind: "live", generatedAt: "2026-10-26T12:00:00.000Z" },
  profile: rosa,
  era: { start: 1952, end: 1972 },
  model: "claude-haiku-5-5",
  picks: [{ section: "music", title: "Dean Martin", why: "Crooner.", inQloo: "yes", inEra: "unknown" }],
  questions: [{ text: "What music did you dance to?", keeps: true }],
  trace: [],
});
const usage = { model: "claude-haiku-5-5", effort: "medium", tokens: { in: 900, cacheWrite: 0, cacheRead: 0, out: 1200 }, costUsd: 0.0069 };

beforeEach(() => {
  vi.stubEnv("KIT_SOURCE", "agent");
  captured.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  buildComparison.mockReset();
  liveKitBlocked.mockReset().mockResolvedValue(null);
  reusedExampleComparison.mockReset().mockResolvedValue(null);
  saveExampleComparison.mockClear();
});

describe("POST /api/compare", () => {
  it("returns the comparison, keeps it for the example profile and counts its cost", async () => {
    buildComparison.mockResolvedValue({ comparison, usage });
    const res = await post(JSON.stringify(rosa));
    expect(res.status).toBe(200);
    expect(ComparisonSchema.parse(await res.json())).toEqual(comparison);
    expect(res.headers.get("x-claude-tokens")).toBe("in=900; cache_write=0; cache_read=0; out=1200");
    expect(res.headers.get("x-claude-cost-usd")).toBe("0.006900");
    expect(saveExampleComparison).toHaveBeenCalledOnce();
    expect(captured).toEqual([
      {
        event: "comparison_built",
        properties: expect.objectContaining({ source: "live", model: "claude-haiku-5-5", input_tokens: 900, output_tokens: 1200, cost_usd: 0.0069 }),
      },
    ]);
  });

  it("checks the profile, and makes no call after a sudden change (D9)", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ ...rosa, thingsToAvoid: [] }))).status).toBe(400);
    const stop = await post(JSON.stringify({ ...rosa, suddenChange: true }));
    expect(stop.status).toBe(400);
    // Before the rest of the profile is checked, as in /api/kit.
    const bare = await post(JSON.stringify({ suddenChange: true }));
    expect(await bare.json()).toEqual({ error: "There's no kit after a sudden change, so there's nothing to compare." });
    expect(buildComparison).not.toHaveBeenCalled();
    expect(liveKitBlocked).not.toHaveBeenCalled();
    expect(captured).toEqual([]);
  });

  it("says so when live kits are off, without calling Claude", async () => {
    vi.stubEnv("KIT_SOURCE", "fixture");
    const res = await post(JSON.stringify(rosa));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: "not_live" });
    expect(buildComparison).not.toHaveBeenCalled();
  });

  it("reuses the example profile's comparison without a limit or a call", async () => {
    reusedExampleComparison.mockResolvedValue({ ...comparison, provenance: { kind: "cached", generatedAt: comparison.provenance.generatedAt } });
    const res = await post(JSON.stringify(rosa));
    expect(res.status).toBe(200);
    expect((await res.json()).provenance.kind).toBe("cached");
    expect(liveKitBlocked).not.toHaveBeenCalled();
    expect(buildComparison).not.toHaveBeenCalled();
    expect(captured).toEqual([{ event: "comparison_built", properties: { source: "reused" } }]);
  });

  it("counts against the live-kit limits", async () => {
    liveKitBlocked.mockResolvedValue("You've built 3 kits in the last hour. Try a sample kit, or come back a little later.");
    const res = await post(JSON.stringify(rosa));
    expect(res.status).toBe(429);
    expect(buildComparison).not.toHaveBeenCalled();
    expect(captured).toEqual([{ event: "comparison_refused", properties: { reason: "visitor_limit" } }]);
  });

  it("maps failures to plain messages", async () => {
    buildComparison.mockRejectedValueOnce(new ComparisonRefusedError("declined"));
    expect((await post(JSON.stringify(rosa))).status).toBe(502);

    const spend = new Anthropic.APIError(400, { type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits." } }, "You have reached your specified API usage limits.", new Headers());
    buildComparison.mockRejectedValueOnce(spend);
    const paused = await post(JSON.stringify(rosa));
    expect(paused.status).toBe(503);
    expect((await paused.json()).error).toMatch(/paused/);

    buildComparison.mockRejectedValueOnce(new Error("boom"));
    expect((await post(JSON.stringify(rosa))).status).toBe(500);
    expect(captured.map((c) => c.properties.reason)).toEqual(["claude_error", "paused", "error"]);
  });
});
