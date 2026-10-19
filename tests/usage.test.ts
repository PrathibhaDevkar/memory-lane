import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KitAudit } from "@/lib/agent/audit";

// An in-memory stand-in for Upstash Redis pipelines.
const counters = vi.hoisted(() => new Map<string, number>());
const fake = vi.hoisted(() => ({
  pipeline: () => {
    const ops: (() => unknown)[] = [];
    const p = {
      incrby: (key: string, n: number) => (ops.push(() => counters.set(key, (counters.get(key) ?? 0) + n).get(key)), p),
      expire: () => (ops.push(() => 1), p),
      exec: async () => ops.map((op) => op()),
    };
    return p;
  },
}));
vi.mock("@/lib/redis", () => ({ redis: fake }));

const { addDailyUsage, dailyLimits } = await import("@/lib/usage");

const audit = (tokens: number, costUsd: number): KitAudit => ({
  model: "claude-haiku-5-5", effort: "medium", calls: 1, tokens: { in: tokens, cacheWrite: 0, cacheRead: 0, out: 0 },
  costUsd, sectionsFilled: 4, questions: 5, removed: 0, passed: true, alerts: [],
});
const day = new Date("2026-10-19T12:00:00Z");

beforeEach(() => counters.clear());
afterEach(() => vi.unstubAllEnvs());

describe("addDailyUsage", () => {
  it("keeps running totals per UTC day", async () => {
    await addDailyUsage(audit(6000, 0.0013), day);
    const totals = await addDailyUsage(audit(6000, 0.0013), day);
    expect(totals).toMatchObject({ day: "2026-10-19", tokens: 12000, alerts: [] });
    expect(totals!.usd).toBeCloseTo(0.0026, 6);
  });

  it("returns a daily alert on every kit once the day is over its limit, and logs the crossing once", async () => {
    vi.stubEnv("TOKEN_ALERT_DAILY_TOKENS", "10000");
    vi.stubEnv("TOKEN_ALERT_DAILY_USD", "0.002");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await addDailyUsage(audit(6000, 0.0013), day))!.alerts).toEqual([]);
    const second = await addDailyUsage(audit(6000, 0.0013), day);
    expect(second!.alerts.join(" ")).toMatch(/12000 tokens, over the daily limit of 10000/);
    expect(second!.alerts.join(" ")).toMatch(/\$0\.00, over the daily limit of \$0.002/);
    const third = await addDailyUsage(audit(6000, 0.0013), day);
    expect(third!.alerts).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("has sensible defaults: a million tokens or $1 a day", () => {
    expect(dailyLimits()).toEqual({ tokens: 1_000_000, usd: 1 });
  });
});
