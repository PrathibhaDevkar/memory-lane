import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auditHeaders, auditKit } from "@/lib/agent/audit";
import { captureAfterResponse, kitBuiltProperties, refusalReason } from "@/lib/analytics/server";
import { buildLiveKit } from "@/lib/agent/run";
import { SAFETY_STOP_MESSAGE } from "@/lib/care";
import { fixtureKit, kitSource } from "@/lib/kit-source";
import { reusedExampleKit, saveExampleKit } from "@/lib/kit-cache";
import { progressResponse, wantsProgress, type KitAnswer, type ProgressEvent } from "@/lib/kit-stream";
import { isSmokeRequest, liveKitBlocked } from "@/lib/ratelimit";
import { KitSchema, ProfileSchema, type Profile, type SafetyStop } from "@/lib/types";
import { addDailyUsage } from "@/lib/usage";

// Upper bound for one kit build. The agent's own time budget (lib/agent/run.ts) stays below
// this; confirm it fits the Vercel plan's function limit when deploying.
export const maxDuration = 120;

// Next.js allows only handlers and segment config as exports from a route file.
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const LIVE_KITS_PAUSED = "Live kits are paused for now. The sample kits show what a full kit looks like.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  // D9: a sudden change is reported for medical evaluation, never treated as a reason for an
  // activity. Checked before anything else, the rest of the form included: no kit, no Qloo or Claude
  // call, and no analytics event (it would say something about the person's health). The stop keeps
  // whatever answers check out, so it can use the name.
  if (isRecord(body) && body.suddenChange === true) {
    const answers = ProfileSchema.partial().safeParse(body);
    const stop: SafetyStop = { mode: "safety_stop", message: SAFETY_STOP_MESSAGE, profile: answers.success ? answers.data : { suddenChange: true } };
    return Response.json(stop);
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    // Field-level messages so the intake form can point at what to fix.
    return Response.json(
      { error: "Invalid profile.", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  switch (kitSource()) {
    case "fixture":
      captureAfterResponse("kit_built", { source: "fixture" });
      return Response.json(fixtureKit(parsed.data));
    case "agent": {
      // The example profile's recent live kit, reused: repeat clicks cost no Claude tokens and
      // count against no limit. The smoke check always builds fresh.
      if (!isSmokeRequest(request)) {
        const reused = await reusedExampleKit(parsed.data);
        if (reused) {
          captureAfterResponse("kit_built", { source: "reused" });
          return Response.json(reused);
        }
      }
      // Visitor and daily limits on live kits; sample kits and the safety stop never get here.
      const blocked = await liveKitBlocked(request);
      if (blocked) {
        captureAfterResponse("kit_refused", { reason: refusalReason(blocked) });
        return Response.json({ error: blocked }, { status: 429 });
      }
      // The page asks to watch the build: each Qloo lookup and Claude call as it happens, then the
      // answer (lib/kit-stream.ts). Everything else gets plain JSON with the audit in the headers.
      if (wantsProgress(request)) return progressResponse((onProgress) => liveKit(parsed.data, onProgress));
      const answer = await liveKit(parsed.data);
      return Response.json(answer.body, { status: answer.status, headers: answer.headers });
    }
  }
}

/** Builds a live kit, audits it and counts its tokens; errors become the message to show. */
async function liveKit(profile: Profile, onProgress?: (event: ProgressEvent) => void): Promise<KitAnswer> {
  const started = Date.now();
  try {
    // Validate the agent's kit against the shared contract before sending it.
    const kit = KitSchema.parse(await buildLiveKit(profile, { onProgress }));
    await saveExampleKit(profile, kit);
    // Audit the kit and its token use, add it to today's totals, and return both, with any
    // token alerts, in the response headers (docs/token-alerts.md). No profile details are logged.
    const audit = auditKit(kit);
    const today = await addDailyUsage(audit);
    const alerts = [...audit.alerts, ...(today?.alerts ?? [])];
    console.log(JSON.stringify({ event: "kit_audit", ...audit, todayTokens: today?.tokens, todayUsd: today?.usd }));
    if (alerts.length) console.warn(JSON.stringify({ event: "token_alert", model: audit.model, alerts }));
    // The same numbers go to PostHog, for token use over time (docs/analytics.md).
    captureAfterResponse("kit_built", kitBuiltProperties(audit, today, alerts, Date.now() - started));
    return { status: 200, body: kit, headers: auditHeaders(audit, alerts) };
  } catch (err) {
    // Out of budget: a spend limit set in the Claude Console (400), the tier's monthly cap (429), or
    // no credits left. Retrying won't help until it's raised, so say live kits are paused.
    if (err instanceof Anthropic.APIError && (err.status === 400 || err.status === 429) && /usage limits|credit balance/i.test(err.message)) {
      console.error(`Claude API spend limit: ${err.message}`);
      captureAfterResponse("kit_refused", { reason: "paused" });
      return { status: 503, body: { error: LIVE_KITS_PAUSED } };
    }
    if (err instanceof Anthropic.RateLimitError) {
      captureAfterResponse("kit_refused", { reason: "claude_busy" });
      return { status: 429, body: { error: "Too many requests to Claude right now." } };
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}: ${err.message}`);
      captureAfterResponse("kit_refused", { reason: "claude_error" });
      return { status: 502, body: { error: "Claude couldn't build the kit." } };
    }
    console.error("Kit build failed:", err);
    captureAfterResponse("kit_refused", { reason: "error" });
    return { status: 500, body: { error: "Something went wrong building the kit." } };
  }
}
