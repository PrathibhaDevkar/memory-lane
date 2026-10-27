// Limits on live kits (docs/plan.md §12.2): per visitor each hour and a cap per day, kept in
// Upstash Redis so they hold across serverless instances. Sample kits and the safety stop never
// reach this code. In production, live kits are refused until Redis is configured, so the app
// can't go live without limits. SMOKE_TOKEN lets scripts/smoke.mjs through.

import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";

/** A positive whole number from the environment, or the fallback for blank or invalid values. */
function count(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : fallback;
}

export const VISITOR_KITS_PER_HOUR = count(process.env.VISITOR_KITS_PER_HOUR, 20);
export const DAILY_LIVE_KITS = count(process.env.DAILY_LIVE_KITS, 1000);

const perVisitor = redis && new Ratelimit({ redis, prefix: "ml:visitor", limiter: Ratelimit.slidingWindow(VISITOR_KITS_PER_HOUR, "1 h") });
const perDay = redis && new Ratelimit({ redis, prefix: "ml:day", limiter: Ratelimit.fixedWindow(DAILY_LIVE_KITS, "1 d") });

/** The smoke check's own requests: they skip the limits and always build a fresh kit. */
export function isSmokeRequest(request: Request): boolean {
  const smoke = process.env.SMOKE_TOKEN;
  return Boolean(smoke) && request.headers.get("x-smoke-token") === smoke;
}

/** Returns null when a live kit may be built, otherwise the message to show the caregiver. */
export async function liveKitBlocked(request: Request): Promise<string | null> {
  if (isSmokeRequest(request)) return null;
  if (!perVisitor || !perDay) {
    return process.env.VERCEL_ENV === "production" ? "Live kits aren't switched on yet. Try one of the sample kits." : null;
  }
  // Visitors are told apart by a hash of their address; the address itself isn't stored.
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const visitor = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  if (!(await perVisitor.limit(visitor)).success) {
    return `You've built ${VISITOR_KITS_PER_HOUR} kits in the last hour. Try a sample kit, or come back a little later.`;
  }
  if (!(await perDay.limit("all")).success) {
    return "Today's live kits are used up. The sample kits show what a full kit looks like.";
  }
  return null;
}
