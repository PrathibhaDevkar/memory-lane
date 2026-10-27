import { afterEach, describe, expect, it, vi } from "vitest";

// Fake Upstash: each limiter reports its prefix and the visitor ID it was asked about.
const limit = vi.fn<(prefix: string, id: string) => Promise<{ success: boolean }>>(async () => ({ success: true }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = (tokens: number, window: string) => ({ tokens, window });
    static fixedWindow = (tokens: number, window: string) => ({ tokens, window });
    prefix: string;
    constructor(opts: { prefix: string }) {
      this.prefix = opts.prefix;
    }
    limit(id: string) {
      return limit(this.prefix, id);
    }
  },
}));

const NO_REDIS = { UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "" };
const REDIS = { ...NO_REDIS, KV_REST_API_URL: "https://example.upstash.io", KV_REST_API_TOKEN: "token" };

// The module reads its settings once, on import, as it does on a server.
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ VERCEL_ENV: "", SMOKE_TOKEN: "", VISITOR_KITS_PER_HOUR: "", DAILY_LIVE_KITS: "", ...env })) {
    vi.stubEnv(name, value);
  }
  return import("@/lib/ratelimit");
}
const request = (headers: Record<string, string> = {}) => new Request("http://localhost/api/kit", { method: "POST", headers });

afterEach(() => {
  vi.unstubAllEnvs();
  limit.mockReset();
  limit.mockResolvedValue({ success: true });
});

describe("liveKitBlocked", () => {
  it("refuses live kits in production until Redis is configured", async () => {
    const { liveKitBlocked } = await load({ ...NO_REDIS, VERCEL_ENV: "production" });
    expect(await liveKitBlocked(request())).toMatch(/aren't switched on yet/);
  });

  it("allows live kits locally and on previews without Redis", async () => {
    for (const VERCEL_ENV of ["", "preview", "development"]) {
      const { liveKitBlocked } = await load({ ...NO_REDIS, VERCEL_ENV });
      expect(await liveKitBlocked(request())).toBeNull();
    }
  });

  it("lets the smoke check through with the right token only", async () => {
    const { liveKitBlocked } = await load({ ...NO_REDIS, VERCEL_ENV: "production", SMOKE_TOKEN: "s3cret-token" });
    expect(await liveKitBlocked(request({ "x-smoke-token": "s3cret-token" }))).toBeNull();
    expect(await liveKitBlocked(request({ "x-smoke-token": "guess" }))).toMatch(/aren't switched on yet/);
    expect(limit).not.toHaveBeenCalled();
  });

  it("counts each visitor by a hash of their address, never the address itself, then the day's total", async () => {
    const { liveKitBlocked } = await load(REDIS);
    expect(await liveKitBlocked(request({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBeNull();
    const [prefix, visitor] = limit.mock.calls[0];
    expect(prefix).toBe("ml:local:visitor");
    expect(visitor).toMatch(/^[0-9a-f]{16}$/);
    expect(visitor).not.toContain("203.0.113");
    expect(limit.mock.calls[1]).toEqual(["ml:local:day", "all"]);
  });

  it("says which limit was reached", async () => {
    const { liveKitBlocked } = await load(REDIS);
    limit.mockImplementation(async (prefix: string) => ({ success: prefix !== "ml:local:visitor" }));
    expect(await liveKitBlocked(request())).toBe("You've built 20 kits in the last hour. Try a sample kit, or come back a little later.");
    limit.mockImplementation(async (prefix: string) => ({ success: prefix !== "ml:local:day" }));
    expect(await liveKitBlocked(request())).toMatch(/Today's live kits are used up/);
  });

  it("takes its limits from the environment, ignoring blank or invalid values", async () => {
    const defaults = await load({ VISITOR_KITS_PER_HOUR: "", DAILY_LIVE_KITS: "lots" });
    expect([defaults.VISITOR_KITS_PER_HOUR, defaults.DAILY_LIVE_KITS]).toEqual([20, 1000]);
    const custom = await load({ ...REDIS, VISITOR_KITS_PER_HOUR: "5", DAILY_LIVE_KITS: "40" });
    expect([custom.VISITOR_KITS_PER_HOUR, custom.DAILY_LIVE_KITS]).toEqual([5, 40]);
    limit.mockImplementation(async (prefix: string) => ({ success: prefix !== "ml:local:visitor" }));
    expect(await custom.liveKitBlocked(request())).toMatch(/^You've built 5 kits/);
  });

  it("allows the 20th kit in an hour and refuses the 21st, for that visitor only", async () => {
    const { liveKitBlocked } = await load(REDIS);
    // A counting stand-in for Upstash's sliding window: 20 per visitor, 1,000 a day.
    const used = new Map<string, number>();
    limit.mockImplementation(async (prefix: string, id: string) => {
      const n = (used.get(prefix + id) ?? 0) + 1;
      used.set(prefix + id, n);
      return { success: n <= (prefix === "ml:local:visitor" ? 20 : 1000) };
    });
    const judge = request({ "x-forwarded-for": "198.51.100.1" });
    for (let i = 1; i <= 20; i++) expect(await liveKitBlocked(judge)).toBeNull();
    expect(await liveKitBlocked(judge)).toMatch(/^You've built 20 kits in the last hour/);
    // Someone else, on another address, still gets a kit.
    expect(await liveKitBlocked(request({ "x-forwarded-for": "198.51.100.2" }))).toBeNull();
  });

  it("refuses everyone once the day's 1,000 kits are used, even a visitor under their own limit", async () => {
    const { liveKitBlocked } = await load(REDIS);
    let today = 0;
    limit.mockImplementation(async (prefix: string) => ({ success: prefix === "ml:local:visitor" || ++today <= 1000 }));
    for (let i = 0; i < 1000; i++) expect(await liveKitBlocked(request({ "x-forwarded-for": `10.0.${i >> 8}.${i & 255}` }))).toBeNull();
    expect(await liveKitBlocked(request({ "x-forwarded-for": "192.0.2.50" }))).toMatch(/Today's live kits are used up/);
  });

  it("counts every request with no address as one shared visitor, so leaving it out doesn't skip the limit", async () => {
    const { liveKitBlocked } = await load(REDIS);
    await liveKitBlocked(request());
    await liveKitBlocked(request());
    const [first, second] = limit.mock.calls.filter(([p]) => p === "ml:local:visitor").map(([, id]) => id);
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(second).toBe(first);
  });

  it("keeps each environment's counts apart, so testing a preview never uses production's limits", async () => {
    for (const [VERCEL_ENV, prefix] of [["preview", "ml:preview"], ["production", "ml:production"], ["", "ml:local"]]) {
      limit.mockClear();
      const { liveKitBlocked } = await load({ ...REDIS, VERCEL_ENV });
      await liveKitBlocked(request());
      expect(limit.mock.calls.map(([p]) => p)).toEqual([`${prefix}:visitor`, `${prefix}:day`]);
    }
  });
});
