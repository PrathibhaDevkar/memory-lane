import { afterEach, describe, expect, it, vi } from "vitest";

// What the kit route sends to analytics: kits and refusals, never a safety stop or profile details.
const capture = vi.fn();
vi.mock("@/lib/analytics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/server")>()),
  captureAfterResponse: (...args: unknown[]) => capture(...args),
}));
const buildLiveKit = vi.fn();
vi.mock("@/lib/agent/run", () => ({ buildLiveKit: (...args: unknown[]) => buildLiveKit(...args) }));
const liveKitBlocked = vi.fn(async (): Promise<string | null> => null);
vi.mock("@/lib/ratelimit", () => ({ liveKitBlocked: () => liveKitBlocked(), isSmokeRequest: () => false }));
const reusedExampleKit = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/kit-cache", () => ({ reusedExampleKit: () => reusedExampleKit(), saveExampleKit: async () => {} }));

const { POST } = await import("@/app/api/kit/route");
const { KitSchema } = await import("@/lib/types");
const rosaKit = KitSchema.parse((await import("@/fixtures/kits/rosa.json")).default);

const walt = {
  suddenChange: false,
  supportLevel: "middle",
  displayName: "Walt",
  birthYear: 1950,
  hometown: "Memphis",
  favorites: [{ text: "Elvis Presley", kind: "artist" }],
  thingsToAvoid: ["war films"],
  traditions: "Gospel on Sundays",
};
const post = (profile: object) =>
  POST(new Request("http://localhost/api/kit", { method: "POST", body: JSON.stringify(profile), headers: { "content-type": "application/json" } }));

describe("POST /api/kit: analytics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    capture.mockClear();
    buildLiveKit.mockReset();
    liveKitBlocked.mockReset();
    liveKitBlocked.mockResolvedValue(null);
    reusedExampleKit.mockReset();
    reusedExampleKit.mockResolvedValue(null);
  });

  it("sends nothing for a safety stop, in either mode", async () => {
    for (const mode of ["fixture", "agent"]) {
      vi.stubEnv("KIT_SOURCE", mode);
      await post({ ...walt, suddenChange: true });
    }
    expect(capture).not.toHaveBeenCalled();
  });

  it("counts sample and reused kits by source only", async () => {
    vi.stubEnv("KIT_SOURCE", "fixture");
    await post(walt);
    vi.stubEnv("KIT_SOURCE", "agent");
    reusedExampleKit.mockResolvedValue({ ...rosaKit, provenance: { kind: "cached", generatedAt: "2026-10-19", note: "Reused." } });
    await post(walt);
    expect(capture.mock.calls).toEqual([
      ["kit_built", { source: "fixture" }],
      ["kit_built", { source: "reused" }],
    ]);
  });

  it("says why a live kit was refused", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    liveKitBlocked.mockResolvedValue("You've built 3 kits in the last hour. Try a sample kit, or come back a little later.");
    await post(walt);
    expect(capture).toHaveBeenCalledWith("kit_refused", { reason: "visitor_limit" });
  });

  it("sends a live kit's token use, and nothing from the profile or the kit", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    const quiet = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {})];
    const llm = { id: "c1", kind: "llm" as const, label: "Claude, turn 1", input: { model: "claude-haiku-5-5", effort: "medium", usage: { in: 1800, cacheWrite: 0, cacheRead: 2550, out: 2300 } }, outputSummary: "Stopped", excluded: [], ms: 900, status: "ok" as const };
    buildLiveKit.mockResolvedValue({ ...rosaKit, trace: [...rosaKit.trace, llm], provenance: { kind: "live", generatedAt: "2026-10-21T10:00:00.000Z" } });
    await post(walt);
    const [event, props] = capture.mock.calls[0];
    expect(event).toBe("kit_built");
    expect(props).toMatchObject({ source: "live", model: "claude-haiku-5-5", input_tokens: 1800, cache_read_tokens: 2550, output_tokens: 2300 });
    const text = JSON.stringify(props);
    for (const personal of ["Walt", "Memphis", "Elvis", "war films", "Gospel", "middle", "1950", "Ella Fitzgerald"]) expect(text).not.toContain(personal);
    for (const q of quiet) q.mockRestore();
  });
});
