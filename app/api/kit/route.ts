import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildLiveKit } from "@/lib/agent/run";
import { fixtureKit, kitSource } from "@/lib/kit-source";
import { KitSchema, ProfileSchema } from "@/lib/types";

// Upper bound for one kit build. The agent's own time budget (lib/agent/run.ts) stays below
// this; confirm it fits the Vercel plan's function limit when deploying.
export const maxDuration = 120;

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

  switch (kitSource()) {
    case "fixture":
      return Response.json(fixtureKit(parsed.data));
    case "agent":
      try {
        // Validate the agent's kit against the shared contract before sending it.
        return Response.json(KitSchema.parse(await buildLiveKit(parsed.data)));
      } catch (err) {
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
