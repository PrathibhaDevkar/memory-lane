import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { refusalReason, captureAfterResponse } from "@/lib/analytics/server";
import { buildComparison, ComparisonRefusedError } from "@/lib/compare";
import { reusedExampleComparison, saveExampleComparison } from "@/lib/kit-cache";
import { kitSource } from "@/lib/kit-source";
import { isSmokeRequest, liveKitBlocked } from "@/lib/ratelimit";
import { ProfileSchema } from "@/lib/types";
import { addDailyUsage } from "@/lib/usage";

// POST /api/compare: the same person and instructions to Claude on its own, without Qloo, with each
// pick checked against Qloo afterwards (lib/compare.ts). For comparison only, next to a kit.
export const maxDuration = 60;

const NEEDS_LIVE = "The comparison asks Claude live, and live kits are off here. The sample kit shows what Memory Lane builds.";
const PAUSED = "Live requests are paused for now. The sample kits show what a full kit looks like.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  // D9: after a sudden change there is no kit to compare, and no Qloo or Claude call is made. Checked
  // before the rest of the profile, as in /api/kit.
  if (typeof body === "object" && body !== null && (body as { suddenChange?: unknown }).suddenChange === true) {
    return Response.json({ error: "There's no kit after a sudden change, so there's nothing to compare." }, { status: 400 });
  }
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid profile.", issues: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
  }
  const profile = parsed.data;
  if (kitSource() !== "agent") return Response.json({ error: NEEDS_LIVE, reason: "not_live" }, { status: 503 });

  if (!isSmokeRequest(request)) {
    const reused = await reusedExampleComparison(profile);
    if (reused) {
      captureAfterResponse("comparison_built", { source: "reused" });
      return Response.json(reused);
    }
  }
  // The same visitor and daily limits as live kits: it's a live Claude call too.
  const blocked = await liveKitBlocked(request);
  if (blocked) {
    captureAfterResponse("comparison_refused", { reason: refusalReason(blocked) });
    return Response.json({ error: blocked }, { status: 429 });
  }

  const started = Date.now();
  try {
    const { comparison, usage } = await buildComparison(profile);
    await saveExampleComparison(profile, comparison);
    // Counted in today's totals like a kit (docs/token-alerts.md); no profile details are logged.
    const today = await addDailyUsage({
      model: usage.model,
      effort: usage.effort,
      calls: 1,
      tokens: usage.tokens,
      costUsd: usage.costUsd,
      sectionsFilled: 0,
      questions: 0,
      removed: 0,
      passed: true,
      alerts: [],
    });
    console.log(JSON.stringify({ event: "comparison_audit", model: usage.model, effort: usage.effort, ...usage.tokens, costUsd: usage.costUsd, todayUsd: today?.usd }));
    if (today?.alerts.length) console.warn(JSON.stringify({ event: "token_alert", model: usage.model, alerts: today.alerts }));
    captureAfterResponse("comparison_built", {
      source: "live",
      model: usage.model,
      input_tokens: usage.tokens.in + usage.tokens.cacheWrite + usage.tokens.cacheRead,
      output_tokens: usage.tokens.out,
      cost_usd: usage.costUsd,
      build_seconds: Math.round((Date.now() - started) / 100) / 10,
    });
    // Usage in the headers, as /api/kit returns it, so the smoke check can report it (--compare).
    const t = usage.tokens;
    return Response.json(comparison, {
      headers: {
        "X-Claude-Model": usage.model,
        "X-Claude-Calls": "1",
        "X-Claude-Tokens": `in=${t.in}; cache_write=${t.cacheWrite}; cache_read=${t.cacheRead}; out=${t.out}`,
        "X-Claude-Cost-USD": usage.costUsd === null ? "unknown" : usage.costUsd.toFixed(6),
        ...(today?.alerts.length ? { "X-Token-Alert": today.alerts.join(" | ") } : {}),
      },
    });
  } catch (err) {
    if (err instanceof ComparisonRefusedError) {
      captureAfterResponse("comparison_refused", { reason: "claude_error" });
      return Response.json({ error: "Claude couldn't make the comparison this time." }, { status: 502 });
    }
    // Out of budget (a spend limit, the tier's monthly cap, or no credits): retrying won't help.
    if (err instanceof Anthropic.APIError && (err.status === 400 || err.status === 429) && /usage limits|credit balance/i.test(err.message)) {
      console.error(`Claude API spend limit: ${err.message}`);
      captureAfterResponse("comparison_refused", { reason: "paused" });
      return Response.json({ error: PAUSED }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      captureAfterResponse("comparison_refused", { reason: "claude_busy" });
      return Response.json({ error: "Too many requests to Claude right now." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}: ${err.message}`);
      captureAfterResponse("comparison_refused", { reason: "claude_error" });
      return Response.json({ error: "Claude couldn't make the comparison this time." }, { status: 502 });
    }
    console.error("Comparison failed:", err);
    captureAfterResponse("comparison_refused", { reason: "error" });
    return Response.json({ error: "Something went wrong making the comparison." }, { status: 500 });
  }
}
