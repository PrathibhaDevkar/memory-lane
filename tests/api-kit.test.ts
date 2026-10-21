import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

const buildLiveKit = vi.fn();
vi.mock("@/lib/agent/run", () => ({ buildLiveKit: (...args: unknown[]) => buildLiveKit(...args) }));
const liveKitBlocked = vi.fn(async (): Promise<string | null> => null);
const isSmokeRequest = vi.fn((): boolean => false);
vi.mock("@/lib/ratelimit", () => ({
  liveKitBlocked: (...args: unknown[]) => liveKitBlocked(...(args as [])),
  isSmokeRequest: (...args: unknown[]) => isSmokeRequest(...(args as [])),
}));
const reusedExampleKit = vi.fn(async (): Promise<unknown> => null);
const saveExampleKit = vi.fn(async () => {});
vi.mock("@/lib/kit-cache", () => ({
  reusedExampleKit: (...args: unknown[]) => reusedExampleKit(...(args as [])),
  saveExampleKit: (...args: unknown[]) => saveExampleKit(...(args as [])),
}));

const { POST } = await import("@/app/api/kit/route");
const { KitSchema, SafetyStopSchema } = await import("@/lib/types");
const rosaKit = KitSchema.parse((await import("@/fixtures/kits/rosa.json")).default);

const post = (body: string) =>
  POST(new Request("http://localhost/api/kit", { method: "POST", body, headers: { "content-type": "application/json" } }));

const walt = {
  suddenChange: false,
  supportLevel: "middle",
  displayName: "Walt",
  birthYear: 1950,
  hometown: "Memphis",
  favorites: [{ text: "Elvis Presley", kind: "artist" }],
  thingsToAvoid: ["war films"],
};

describe("POST /api/kit (fixture mode)", () => {
  it("returns a contract-valid kit labeled as a fixture", async () => {
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(200);
    const kit = KitSchema.parse(await res.json());
    expect(kit.provenance.kind).toBe("fixture");
    // The caregiver is told this isn't their kit yet.
    expect(kit.provenance.note).toContain("You asked for Walt (born 1950, Memphis)");
  });

  it("returns 400 with field errors for an invalid profile", async () => {
    const res = await post(JSON.stringify({ ...walt, thingsToAvoid: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toHaveProperty("thingsToAvoid");
  });

  it("gives plain messages for missing fields, not zod defaults", async () => {
    const res = await post(JSON.stringify({}));
    expect(res.status).toBe(400);
    const { issues } = await res.json();
    for (const field of ["suddenChange", "displayName", "supportLevel", "birthYear", "hometown", "favorites", "thingsToAvoid"]) {
      expect(issues[field]?.[0]).toBeTruthy();
      expect(issues[field][0]).not.toMatch(/Invalid input|expected/);
    }
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await post("not json");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/kit: sudden-change safety stop (D9)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    buildLiveKit.mockReset();
  });

  it("returns a safety stop and never runs the agent, even in live mode", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    const res = await post(JSON.stringify({ ...walt, suddenChange: true }));
    expect(res.status).toBe(200);
    const stop = SafetyStopSchema.parse(await res.json());
    expect(stop.message).toMatch(/nurse or doctor/);
    expect(buildLiveKit).not.toHaveBeenCalled();
    // The safety stop is never rate limited.
    expect(liveKitBlocked).not.toHaveBeenCalled();
  });

  it("requires an answer to the sudden-change question", async () => {
    const withoutAnswer: Partial<typeof walt> = { ...walt };
    delete withoutAnswer.suddenChange;
    const res = await post(JSON.stringify(withoutAnswer));
    expect(res.status).toBe(400);
    expect((await res.json()).issues.suddenChange[0]).toMatch(/sudden changes/);
  });

  it("requires a support level, with a plain message", async () => {
    const res = await post(JSON.stringify({ ...walt, supportLevel: undefined }));
    expect((await res.json()).issues.supportLevel[0]).toMatch(/how much support/i);
  });
});

describe("POST /api/kit (live mode): limits and spend", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    buildLiveKit.mockReset();
    liveKitBlocked.mockReset();
    liveKitBlocked.mockResolvedValue(null);
  });
  const apiError = (status: number, type: string, message: string) =>
    Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, undefined, new Headers());

  it("answers 429 with the limit's own message, without running the agent", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    liveKitBlocked.mockResolvedValue("You've built 3 kits in the last hour. Try a sample kit, or come back a little later.");
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/3 kits in the last hour/);
    expect(buildLiveKit).not.toHaveBeenCalled();
  });

  it("never checks the limits for saved sample kits", async () => {
    vi.stubEnv("KIT_SOURCE", "fixture");
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(200);
    expect(liveKitBlocked).not.toHaveBeenCalled();
  });

  it.each([
    [400, "invalid_request_error", "You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."],
    [400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."],
    [429, "rate_limit_error", "You have reached your API usage limits: your organization has crossed its monthly API usage threshold."],
  ])("says live kits are paused when Claude's spend limit is reached (%i)", async (status, type, message) => {
    vi.stubEnv("KIT_SOURCE", "agent");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    buildLiveKit.mockRejectedValue(apiError(status, type, message));
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Live kits are paused/);
    quiet.mockRestore();
  });

  it("still treats an ordinary Claude rate limit as 'try again'", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    buildLiveKit.mockRejectedValue(apiError(429, "rate_limit_error", "Number of request tokens has exceeded your per-minute rate limit"));
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/Too many requests to Claude/);
  });
});

describe("POST /api/kit (live mode): the example profile's reused kit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    buildLiveKit.mockReset();
    liveKitBlocked.mockReset();
    liveKitBlocked.mockResolvedValue(null);
    isSmokeRequest.mockReset();
    isSmokeRequest.mockReturnValue(false);
    reusedExampleKit.mockReset();
    reusedExampleKit.mockResolvedValue(null);
    saveExampleKit.mockClear();
  });

  it("serves the reused kit without checking limits or calling Claude", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    reusedExampleKit.mockResolvedValue({ ...rosaKit, provenance: { kind: "cached", generatedAt: "2026-10-19", note: "Reused." } });
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(200);
    expect(KitSchema.parse(await res.json()).provenance.kind).toBe("cached");
    expect(liveKitBlocked).not.toHaveBeenCalled();
    expect(buildLiveKit).not.toHaveBeenCalled();
  });

  it("returns the kit's audit, its token use and any alerts in the response headers", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    vi.stubEnv("TOKEN_ALERT_KIT_OUTPUT", "1000");
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const llm = { id: "c1", kind: "llm" as const, label: "Claude, turn 1", input: { model: "claude-haiku-5-5", effort: "medium", usage: { in: 2000, cacheWrite: 3000, cacheRead: 0, out: 1500 } }, outputSummary: "Asked for: submit_kit", excluded: [], ms: 900, status: "ok" as const };
    buildLiveKit.mockResolvedValue({ ...rosaKit, trace: [...rosaKit.trace, llm], provenance: { kind: "live", generatedAt: "2026-10-19T18:40:12.000Z" } });
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Claude-Model")).toBe("claude-haiku-5-5");
    expect(res.headers.get("X-Claude-Tokens")).toBe("in=2000; cache_write=3000; cache_read=0; out=1500");
    expect(res.headers.get("X-Kit-Audit")).toBe("pass");
    expect(res.headers.get("X-Token-Alert")).toMatch(/1500 output tokens, over the limit of 1000/);
    // The audit is logged without profile details.
    const line = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("kit_audit"))!;
    expect(line).not.toMatch(/Walt|Memphis|Elvis/);
    quiet.mockRestore();
    log.mockRestore();
  });

  it("offers a fresh live kit for saving, and the smoke check always builds fresh", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    isSmokeRequest.mockReturnValue(true);
    const live = { ...rosaKit, provenance: { kind: "live" as const, generatedAt: "2026-10-19T18:40:12.000Z" } };
    buildLiveKit.mockResolvedValue(live);
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(200);
    expect(reusedExampleKit).not.toHaveBeenCalled();
    expect(saveExampleKit).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Walt" }), live);
  });
});
