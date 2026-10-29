// The day's running totals of Claude tokens and cost, kept in Redis for 3 days. Past
// TOKEN_ALERT_DAILY_TOKENS or TOKEN_ALERT_DAILY_USD, every live kit that day returns a daily token
// alert, and the server log records the moment the limit was crossed. See docs/token-alerts.md.

import type { KitAudit } from "@/lib/agent/audit";
import { key, redis } from "@/lib/redis";

const KEEP_SECONDS = 3 * 24 * 3600;

function limit(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function dailyLimits() {
  return {
    tokens: limit(process.env.TOKEN_ALERT_DAILY_TOKENS, 1_000_000),
    usd: limit(process.env.TOKEN_ALERT_DAILY_USD, 1),
  };
}

export type DailyUsage = { day: string; tokens: number; usd: number; alerts: string[] };

/** Adds a kit's usage to today's totals (UTC). Null without Redis or if Redis fails. */
export async function addDailyUsage(audit: KitAudit, now = new Date()): Promise<DailyUsage | null> {
  if (!redis) return null;
  const day = now.toISOString().slice(0, 10);
  const t = audit.tokens;
  const tokens = t.in + t.cacheWrite + t.cacheRead + t.out;
  const microUsd = Math.round((audit.costUsd ?? 0) * 1e6);
  const tokensKey = key(`usage:${day}:tokens`);
  const usdKey = key(`usage:${day}:micro_usd`);
  try {
    const p = redis.pipeline();
    p.incrby(tokensKey, tokens);
    p.incrby(usdKey, microUsd);
    p.expire(tokensKey, KEEP_SECONDS);
    p.expire(usdKey, KEEP_SECONDS);
    const [tokensToday, microToday] = (await p.exec()) as [number, number, unknown, unknown];
    const usdToday = microToday / 1e6;

    const max = dailyLimits();
    const alerts: string[] = [];
    if (tokensToday > max.tokens) alerts.push(`Today's Claude use is ${tokensToday} tokens, over the daily limit of ${max.tokens}.`);
    if (usdToday > max.usd) alerts.push(`Today's Claude cost is $${usdToday.toFixed(2)}, over the daily limit of $${max.usd}.`);
    // Log only the kit that crossed a limit, so the log shows when it happened without repeating.
    const crossed = (before: number, after: number, cap: number) => before <= cap && after > cap;
    if (crossed(tokensToday - tokens, tokensToday, max.tokens) || crossed(usdToday - microUsd / 1e6, usdToday, max.usd)) {
      console.warn(JSON.stringify({ event: "token_alert_daily", day, tokens: tokensToday, usd: usdToday }));
    }
    return { day, tokens: tokensToday, usd: usdToday, alerts };
  } catch (err) {
    console.error("Daily usage update failed:", err);
    return null;
  }
}
