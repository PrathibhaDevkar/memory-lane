// Audits each live kit: what it cost in Claude tokens and whether it meets the quality bar. The
// audit goes to the server log (no profile details) and back to the caller in response headers,
// and a token alert fires when a kit goes past its limits. See docs/token-alerts.md.

import type { Kit } from "@/lib/types";

/** US$ per million tokens, list prices on Oct 19, 2026: platform.claude.com/docs/en/about-claude/pricing */
export const PRICES: Record<string, Usage> = {
  "claude-haiku-5-5": { in: 0.1, cacheWrite: 0.125, cacheRead: 0.01, out: 0.5 }, // prompts up to 100K tokens
  "claude-sonnet-5-5": { in: 2, cacheWrite: 2.5, cacheRead: 0.1, out: 10 },
  "claude-opus-5-5": { in: 4, cacheWrite: 5, cacheRead: 0.2, out: 20 },
};

export type Usage = { in: number; cacheWrite: number; cacheRead: number; out: number };
const PARTS = ["in", "cacheWrite", "cacheRead", "out"] as const;

export type KitAudit = {
  /** The model that answered the last call ("none" when Claude wasn't called). */
  model: string;
  effort: string;
  calls: number;
  tokens: Usage;
  /** At list prices; null when the model has no price in PRICES. */
  costUsd: number | null;
  sectionsFilled: number;
  questions: number;
  /** Picks, questions or ideas the code removed (not grounded, or breaking a care rule). */
  removed: number;
  /** The smoke check's bar: at least 2 sections filled and enough questions for the support level. */
  passed: boolean;
  alerts: string[];
};

const MIN_QUESTIONS = { early: 3, middle: 1, late: 0 } as const;

/** A positive number from the environment, or the fallback for blank or invalid values. */
function limit(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Per-kit limits. Past any of them, the kit raises a token alert. */
export function kitLimits() {
  return {
    inputTokens: limit(process.env.TOKEN_ALERT_KIT_INPUT, 12_000),
    outputTokens: limit(process.env.TOKEN_ALERT_KIT_OUTPUT, 4_000),
    calls: limit(process.env.TOKEN_ALERT_KIT_CALLS, 2),
    usd: limit(process.env.TOKEN_ALERT_KIT_USD, 0.05),
  };
}

export const priceFor = (model: string) => Object.entries(PRICES).find(([name]) => model.startsWith(name))?.[1];

export function auditKit(kit: Kit): KitAudit {
  const turns = kit.trace.filter((s) => s.kind === "llm");
  const tokens: Usage = { in: 0, cacheWrite: 0, cacheRead: 0, out: 0 };
  let costUsd: number | null = 0;
  for (const turn of turns) {
    const usage = (turn.input.usage ?? {}) as Partial<Usage>;
    const price = priceFor(String(turn.input.model ?? ""));
    for (const part of PARTS) tokens[part] += usage[part] ?? 0;
    costUsd = price && costUsd !== null ? costUsd + PARTS.reduce((n, part) => n + ((usage[part] ?? 0) * price[part]) / 1e6, 0) : null;
  }

  const sectionsFilled = [kit.music, kit.screen, kit.dish, kit.place].filter((s) => s.status === "ok").length;
  const removed = kit.trace.filter((s) => s.kind === "validator").reduce((n, s) => n + s.excluded.length, 0);
  const passed = sectionsFilled >= 2 && kit.prompts.length >= MIN_QUESTIONS[kit.profile.supportLevel];

  const max = kitLimits();
  const input = tokens.in + tokens.cacheWrite + tokens.cacheRead;
  const alerts: string[] = [];
  if (input > max.inputTokens) alerts.push(`Kit read ${input} input tokens, over the limit of ${max.inputTokens}.`);
  if (tokens.out > max.outputTokens) alerts.push(`Kit wrote ${tokens.out} output tokens, over the limit of ${max.outputTokens}.`);
  if (turns.length > max.calls) alerts.push(`Kit took ${turns.length} Claude calls, over the limit of ${max.calls}.`);
  if (costUsd !== null && costUsd > max.usd) alerts.push(`Kit cost $${costUsd.toFixed(4)}, over the limit of $${max.usd}.`);

  return {
    model: String(turns.at(-1)?.input.model ?? "none"),
    effort: String(turns.at(-1)?.input.effort ?? "none"),
    calls: turns.length,
    tokens,
    costUsd: costUsd === null ? null : Number(costUsd.toFixed(6)),
    sectionsFilled,
    questions: kit.prompts.length,
    removed,
    passed,
    alerts,
  };
}

/** The audit as response headers, so every call to /api/kit returns its own usage and alerts. */
export function auditHeaders(audit: KitAudit, alerts: string[]): Record<string, string> {
  const t = audit.tokens;
  return {
    "X-Claude-Model": audit.model,
    "X-Claude-Calls": String(audit.calls),
    "X-Claude-Tokens": `in=${t.in}; cache_write=${t.cacheWrite}; cache_read=${t.cacheRead}; out=${t.out}`,
    "X-Claude-Cost-USD": audit.costUsd === null ? "unknown" : audit.costUsd.toFixed(6),
    "X-Kit-Audit": audit.passed ? "pass" : "fail",
    ...(alerts.length ? { "X-Token-Alert": alerts.join(" | ") } : {}),
  };
}
