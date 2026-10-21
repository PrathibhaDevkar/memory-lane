import { afterEach, describe, expect, it, vi } from "vitest";
import rosa from "@/fixtures/kits/rosa.json";
import { auditHeaders, auditKit, kitLimits } from "@/lib/agent/audit";
import { KitSchema, type Kit, type TraceStep } from "@/lib/types";

const sample = KitSchema.parse(rosa);
const turn = (model: string, usage: Record<string, number>, effort = "medium"): TraceStep => ({
  id: `t${Math.random()}`, kind: "llm", label: "Claude, turn", input: { model, effort, usage }, outputSummary: "", excluded: [], ms: 1000, status: "ok",
});
const withTurns = (...turns: TraceStep[]): Kit => ({ ...sample, trace: [...sample.trace, ...turns] });
const gap = { status: "gap" as const, items: [], gapReason: "Nothing suitable came back." };

afterEach(() => vi.unstubAllEnvs());

describe("auditKit", () => {
  it("adds up each call's tokens and prices them for the model that answered", () => {
    const audit = auditKit(withTurns(turn("claude-haiku-5-5", { in: 2000, cacheWrite: 3000, cacheRead: 0, out: 1500 })));
    expect(audit).toMatchObject({ model: "claude-haiku-5-5", effort: "medium", calls: 1, tokens: { in: 2000, cacheWrite: 3000, cacheRead: 0, out: 1500 } });
    // Haiku 5.5: 2,000 x $0.10 + 3,000 x $0.125 + 1,500 x $0.50, per million tokens.
    expect(audit.costUsd).toBeCloseTo(0.0002 + 0.000375 + 0.00075, 6);
    expect(audit.alerts).toEqual([]);
  });

  it("raises token alerts when a kit goes past its limits", () => {
    const big = turn("claude-opus-5-5", { in: 9000, cacheWrite: 4000, cacheRead: 0, out: 5000 });
    const audit = auditKit(withTurns(big, big, big));
    expect(audit.alerts.join(" ")).toMatch(/input tokens, over the limit of 12000/);
    expect(audit.alerts.join(" ")).toMatch(/output tokens, over the limit of 4000/);
    expect(audit.alerts.join(" ")).toMatch(/3 Claude calls, over the limit of 2/);
    expect(audit.alerts.join(" ")).toMatch(/cost \$\d+\.\d{4}, over the limit of \$0.05/);
  });

  it("takes its limits from the environment, ignoring blank or invalid values", () => {
    vi.stubEnv("TOKEN_ALERT_KIT_OUTPUT", "800");
    vi.stubEnv("TOKEN_ALERT_KIT_CALLS", "nope");
    expect(kitLimits()).toMatchObject({ outputTokens: 800, calls: 2 });
    expect(auditKit(withTurns(turn("claude-haiku-5-5", { in: 10, cacheWrite: 0, cacheRead: 0, out: 900 }))).alerts).toHaveLength(1);
  });

  it("checks the kit against the smoke check's bar and counts what the code removed", () => {
    expect(auditKit(sample)).toMatchObject({ calls: 0, model: "none", sectionsFilled: 4, passed: true });
    const thin = auditKit({ ...sample, screen: gap, dish: gap, place: gap });
    expect(thin).toMatchObject({ sectionsFilled: 1, passed: false });
    const removedStep: TraceStep = { id: "v", kind: "validator", label: "grounding + question check", input: {}, outputSummary: "", excluded: [{ title: "music: x", reason: "Not returned by Qloo in this run; removed." }], ms: 0, status: "ok" };
    expect(auditKit(withTurns(removedStep)).removed).toBeGreaterThanOrEqual(1);
  });

  it("can't price a model it has no rate for, and says so instead of guessing", () => {
    const audit = auditKit(withTurns(turn("claude-unknown-9", { in: 100, cacheWrite: 0, cacheRead: 0, out: 100 })));
    expect(audit.costUsd).toBeNull();
    expect(auditHeaders(audit, [])["X-Claude-Cost-USD"]).toBe("unknown");
  });
});

describe("auditHeaders", () => {
  it("returns usage, the audit result and any alerts on the call", () => {
    const audit = auditKit(withTurns(turn("claude-haiku-5-5", { in: 2000, cacheWrite: 0, cacheRead: 3000, out: 1200 })));
    const headers = auditHeaders(audit, ["Today's Claude cost is $1.20, over the daily limit of $1."]);
    expect(headers).toMatchObject({
      "X-Claude-Model": "claude-haiku-5-5",
      "X-Claude-Calls": "1",
      "X-Claude-Tokens": "in=2000; cache_write=0; cache_read=3000; out=1200",
      "X-Kit-Audit": "pass",
      "X-Token-Alert": "Today's Claude cost is $1.20, over the daily limit of $1.",
    });
    expect(auditHeaders(audit, [])).not.toHaveProperty("X-Token-Alert");
  });
});
