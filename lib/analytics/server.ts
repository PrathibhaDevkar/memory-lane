// Server events for PostHog (docs/analytics.md): what each kit cost in Claude tokens, and why a live
// kit was refused. Sent after the response has gone, so they never slow a kit down, and only when
// NEXT_PUBLIC_POSTHOG_KEY is set. No person profile and no visitor details: each event gets a
// random ID from the SDK.

import { after } from "next/server";
import { PostHog } from "posthog-node";
import type { KitAudit } from "@/lib/agent/audit";
import type { DailyUsage } from "@/lib/usage";
import { posthogHosts, posthogKey } from "./config";
import { pick, SERVER_EVENTS, type ServerEvents } from "./events";

/** Sends one event once the response is done. Never throws; a failure is logged and dropped. */
export function captureAfterResponse<E extends keyof ServerEvents>(event: E, properties: ServerEvents[E]) {
  const key = posthogKey();
  if (!key) return;
  const send = async () => {
    // Short timeout and one retry: an analytics outage must not hold the function open for long.
    const client = new PostHog(key, { host: posthogHosts().ingest, flushAt: 1, flushInterval: 0, requestTimeout: 5000, fetchRetryCount: 1 });
    try {
      await client.captureImmediate({ event, properties: { ...pick(SERVER_EVENTS[event], properties), $process_person_profile: false } });
    } catch (err) {
      console.warn(JSON.stringify({ event: "analytics_failed", error: err instanceof Error ? err.name : String(err) }));
    } finally {
      await client.shutdown().catch(() => {});
    }
  };
  try {
    after(send);
  } catch {
    // Outside a request (scripts, tests): send it now, without waiting.
    void send();
  }
}

const ALERT_KINDS: [RegExp, string][] = [
  [/^Kit read/, "kit_input"],
  [/^Kit wrote/, "kit_output"],
  [/^Kit took/, "kit_calls"],
  [/^Kit cost/, "kit_usd"],
  [/^Today's Claude use/, "daily_tokens"],
  [/^Today's Claude cost/, "daily_usd"],
];

/** A live kit's token use and quality signals from its audit; nothing from the profile or the kit's picks. */
export function kitBuiltProperties(audit: KitAudit, today: DailyUsage | null, alerts: string[], ms: number): ServerEvents["kit_built"] {
  return {
    source: "live",
    model: audit.model,
    effort: audit.effort,
    claude_calls: audit.calls,
    input_tokens: audit.tokens.in,
    cache_write_tokens: audit.tokens.cacheWrite,
    cache_read_tokens: audit.tokens.cacheRead,
    output_tokens: audit.tokens.out,
    cost_usd: audit.costUsd,
    audit_passed: audit.passed,
    sections_filled: audit.sectionsFilled,
    removed: audit.removed,
    alerts: alerts.length,
    alert_kinds: alerts.map((a) => ALERT_KINDS.find(([re]) => re.test(a))?.[1] ?? "other"),
    build_seconds: Math.round(ms / 100) / 10,
    today_tokens: today?.tokens,
    today_usd: today?.usd,
  };
}

/** Why a live kit was refused, from the limit's message (lib/ratelimit.ts). */
export function refusalReason(message: string): ServerEvents["kit_refused"]["reason"] {
  if (/switched on/i.test(message)) return "not_configured";
  if (/last hour/i.test(message)) return "visitor_limit";
  return "daily_limit";
}
