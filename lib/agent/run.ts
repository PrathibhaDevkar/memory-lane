// The agent loop (docs/plan.md §7.2). Claude decides which Qloo lookups to make; the
// tools enforce the rules; buildKit() keeps only grounded picks.
//
// Guardrails: at most MAX_TURNS Claude calls, a wall-clock budget, and a final turn where only
// submit_kit is offered, so the loop always ends.

import Anthropic from "@anthropic-ai/sdk";
import { eraWindow } from "@/lib/era";
import type { Kit, Profile } from "@/lib/types";
import { RunContext, runTool, TOOLS } from "@/lib/qloo/tools";
import { buildKit } from "./kit";
import { SUBMIT_KIT, SYSTEM_PROMPT, type Submission } from "./prompts";

const MAX_TURNS = 6;
const TIME_BUDGET_MS = 90_000;

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function agentConfig() {
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
  const effort = (process.env.CLAUDE_EFFORT || "medium") as Effort;
  return { model, effort };
}

export async function buildLiveKit(profile: Profile, opts: { client?: Anthropic; fetchImpl?: typeof fetch } = {}): Promise<Kit> {
  const client = opts.client ?? new Anthropic();
  const { model, effort } = agentConfig();
  const ctx = new RunContext(profile, eraWindow(profile.birthYear), opts.fetchImpl);
  const started = Date.now();

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Build a session kit for this person.\n\n${JSON.stringify({
        name: profile.displayName,
        born: profile.birthYear,
        grew_up_in: profile.hometown,
        formative_years: `${ctx.era.start}–${ctx.era.end}`,
        favorites: profile.favorites,
        things_to_avoid: profile.thingsToAvoid,
      })}`,
    },
  ];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const final = turn === MAX_TURNS || Date.now() - started > TIME_BUDGET_MS;
    const t0 = Date.now();
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // On the last turn only submit_kit is offered, so Claude has to finish with what it has.
      tools: final ? [SUBMIT_KIT] : [...TOOLS, SUBMIT_KIT],
      output_config: { effort },
      messages,
      // Server-side fallback: if a safety classifier declines, the API retries on a recommended
      // model inside the same call. Not available for Haiku.
      ...(model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    });

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    ctx.trace.push({
      id: ctx.nextId(),
      kind: "llm",
      label: `Claude, turn ${turn}`,
      input: { model: response.model, effort },
      outputSummary: toolUses.length ? `Asked for: ${toolUses.map((t) => t.name).join(", ")}` : `Stopped: ${response.stop_reason}`,
      excluded: [],
      ms: Date.now() - t0,
      status: response.stop_reason === "refusal" ? "gap" : "ok",
    });

    if (response.stop_reason === "refusal") {
      return buildKit(ctx, null, "Claude declined this request, so the kit couldn't be built.");
    }
    if (response.stop_reason === "max_tokens") {
      return buildKit(ctx, null, "The agent ran out of room before finishing.");
    }

    const submit = toolUses.find((t) => t.name === "submit_kit");
    if (submit) return buildKit(ctx, submit.input as Submission);

    // Keep the full response (including thinking blocks) unchanged in the history.
    messages.push({ role: "assistant", content: response.content });

    if (!toolUses.length) {
      messages.push({ role: "user", content: "Please call submit_kit now with what you have." });
      continue;
    }

    // Run every tool call from this turn in parallel; return all results in one message.
    const results = await Promise.all(
      toolUses.map(async (t) => {
        const out = await runTool(ctx, t.name, t.input);
        return { type: "tool_result" as const, tool_use_id: t.id, content: out.content, is_error: out.isError };
      }),
    );
    messages.push({ role: "user", content: results });
  }

  return buildKit(ctx, null, "The agent didn't finish within its limits.");
}
