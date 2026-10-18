import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildLiveKit } from "@/lib/agent/run";
import { SAFETY_STOP_MESSAGE } from "@/lib/care";
import { fixtureKit, kitSource } from "@/lib/kit-source";
import { liveKitBlocked } from "@/lib/ratelimit";
import { KitSchema, ProfileSchema, type SafetyStop } from "@/lib/types";

// Upper bound for one kit build. The agent's own time budget (lib/agent/run.ts) stays below
// this; confirm it fits the Vercel plan's function limit when deploying.
export const maxDuration = 120;

// Next.js allows only handlers and segment config as exports from a route file.
const LIVE_KITS_PAUSED = "Live kits are paused for now. The sample kits show what a full kit looks like.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    // Field-level messages so the intake form can point at what to fix.
    return Response.json(
      { error: "Invalid profile.", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  // D9: a sudden change is reported for medical evaluation, never treated as a reason for an
  // activity. Checked before anything else: no kit, and no Qloo or Claude call.
  if (parsed.data.suddenChange) {
    const stop: SafetyStop = { mode: "safety_stop", message: SAFETY_STOP_MESSAGE, profile: parsed.data };
    return Response.json(stop);
  }

  switch (kitSource()) {
    case "fixture":
      return Response.json(fixtureKit(parsed.data));
    case "agent": {
      // Visitor and daily limits on live kits; sample kits and the safety stop never get here.
      const blocked = await liveKitBlocked(request);
      if (blocked) return Response.json({ error: blocked }, { status: 429 });
      try {
        // Validate the agent's kit against the shared contract before sending it.
        return Response.json(KitSchema.parse(await buildLiveKit(parsed.data)));
      } catch (err) {
        // Out of budget: a spend limit set in the Claude Console (400), the tier's monthly cap (429), or
        // no credits left. Retrying won't help until it's raised, so say live kits are paused.
        if (err instanceof Anthropic.APIError && (err.status === 400 || err.status === 429) && /usage limits|credit balance/i.test(err.message)) {
          console.error(`Claude API spend limit: ${err.message}`);
          return Response.json({ error: LIVE_KITS_PAUSED }, { status: 503 });
        }
        if (err instanceof Anthropic.RateLimitError) {
          return Response.json({ error: "Too many requests to Claude right now." }, { status: 429 });
        }
        if (err instanceof Anthropic.APIError) {
          console.error(`Claude API error ${err.status}: ${err.message}`);
          return Response.json({ error: "Claude couldn't build the kit." }, { status: 502 });
        }
        console.error("Kit build failed:", err);
        return Response.json({ error: "Something went wrong building the kit." }, { status: 500 });
      }
    }
  }
}
