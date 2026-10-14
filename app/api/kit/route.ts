import { z } from "zod";
import { fixtureKit, kitSource } from "@/lib/kit-source";
import { ProfileSchema } from "@/lib/types";

// Upper bound for one kit build. The live agent's own time budget (implementation-plan.md §4.2)
// stays below this; confirm it fits the Vercel plan's function limit when deploying.
export const maxDuration = 60;

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
  }
}
