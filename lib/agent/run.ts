// The agent loop (docs/plan.md §7.2). Claude decides which Qloo lookups to make; the
// tools enforce the rules; buildKit() keeps only grounded picks.
//
// Guardrails: at most MAX_TURNS Claude calls and one deadline for the whole build, so the route
// answers before its function limit. Near the end Claude is asked to call submit_kit and further
// lookups are refused, so the loop ends with what it has.
//
// Every request repeats the same system prompt and tools, and the history only grows. Thinking
// blocks are bound to that prefix: changing it, even removing a tool, makes the API reject the next
// request on accounts created on or after Aug 31, 2026.
//
// Cost: the tools and system prompt are cached (a breakpoint on the system prompt, which comes after
// the tools), and top-level caching covers the history as it grows. The favorites are looked up in
// code before the first call, which saves Claude a turn. Each call's token use goes into the trace
// and the server log.

import Anthropic from "@anthropic-ai/sdk";
import { eraWindow } from "@/lib/era";
import type { Kit, Profile } from "@/lib/types";
import { RunContext, runTool, TOOLS } from "@/lib/qloo/tools";
import { buildKit } from "./kit";
import { SUBMIT_KIT, SYSTEM_PROMPT, type Submission } from "./prompts";

const MAX_TURNS = 6;
// The whole build, Claude and Qloo together. Stays under the route's maxDuration (120 s) with room
// to check and send the kit.
export const BUDGET_MS = 100_000;
// With less than this left, the next turn is the last one.
const LAST_TURN_MS = 40_000;
// Not worth starting a Claude turn with less than this left.
const MIN_TURN_MS = 5_000;

const ALL_TOOLS = [...TOOLS, SUBMIT_KIT];
export const FINISH_NOW = "That's all the lookups for this kit. Call submit_kit now with what you have, and use gaps for anything missing.";
const LOOKUPS_CLOSED = JSON.stringify({ error: "Lookups are closed for this kit. Call submit_kit with what you have." });
const OUT_OF_TIME = "The agent ran out of time before finishing.";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function agentConfig() {
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
  const effort = (process.env.CLAUDE_EFFORT || "medium") as Effort;
  return { model, effort };
}

/** Adds a text block to a user message that hasn't been sent yet. */
function appendText(message: Anthropic.Beta.BetaMessageParam, text: string) {
  message.content =
    typeof message.content === "string"
      ? [{ type: "text", text: message.content }, { type: "text", text }]
      : [...message.content, { type: "text", text }];
}

export async function buildLiveKit(
  profile: Profile,
  opts: { client?: Anthropic; fetchImpl?: typeof fetch; budgetMs?: number } = {},
): Promise<Kit> {
  const client = opts.client ?? new Anthropic();
  const { model, effort } = agentConfig();
  const deadline = Date.now() + (opts.budgetMs ?? BUDGET_MS);
  const ctx = new RunContext(profile, eraWindow(profile.birthYear), opts.fetchImpl, deadline);

  // One Qloo search per favorite, in parallel, so Claude's first turn can go straight to the lookups.
  const resolved = await Promise.all(
    profile.favorites.map(async (f) => ({
      favorite: f.text,
      ...JSON.parse((await runTool(ctx, "resolve_favorite", { name: f.text, kind: f.kind })).content),
    })),
  );

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Build a session kit for this person.\n\n${JSON.stringify({
        likes_to_be_called: profile.displayName,
        support_level: profile.supportLevel,
        born: profile.birthYear,
        grew_up_in: profile.hometown,
        formative_years: `${ctx.era.start}–${ctx.era.end}`,
        favorites: profile.favorites,
        favorites_resolved: resolved,
        things_to_avoid: profile.thingsToAvoid,
        former_work: profile.formerWork,
        first_language: profile.firstLanguage,
        traditions: profile.traditions,
      })}`,
    },
  ];

  let askedToFinish = false;
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const left = deadline - Date.now();
    if (left < MIN_TURN_MS) return buildKit(ctx, null, OUT_OF_TIME);
    const final = turn === MAX_TURNS || left < LAST_TURN_MS;
    // The last message is the user turn about to be sent, so adding to it doesn't edit history.
    if (final && !askedToFinish) {
      appendText(messages.at(-1)!, FINISH_NOW);
      askedToFinish = true;
    }

    const t0 = Date.now();
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create(
        {
          model,
          max_tokens: 16000,
          // Cached together with the tools before it. Both stay the same on every turn.
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: ALL_TOOLS, // the same on every turn (see the note at the top)
          output_config: { effort },
          messages,
          // Automatic caching of the history, moving forward as it grows.
          cache_control: { type: "ephemeral" },
          // Server-side fallback: if a safety classifier declines, the API retries on a recommended
          // model inside the same call. Not available for Haiku.
          ...(model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
        },
        // Cancels the call, retries included, when the kit's time runs out.
        { signal: AbortSignal.timeout(left) },
      );
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) {
        return buildKit(ctx, null, OUT_OF_TIME);
      }
      throw err;
    }

    // Token use for this call. Logged without any profile details: nothing about a person is kept.
    const u = response.usage;
    const usage = {
      in: u?.input_tokens ?? 0,
      cacheWrite: u?.cache_creation_input_tokens ?? 0,
      cacheRead: u?.cache_read_input_tokens ?? 0,
      out: u?.output_tokens ?? 0, // includes thinking, which is billed as output
    };
    console.log(JSON.stringify({ event: "claude_turn", turn, model: response.model, effort, ...usage }));

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    ctx.trace.push({
      id: ctx.nextId(),
      kind: "llm",
      label: `Claude, turn ${turn}`,
      input: { model: response.model, effort, usage },
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
    // On the last turn lookups are refused, so Claude finishes with what it has.
    const results = await Promise.all(
      toolUses.map(async (t) => {
        const out = final ? refuseLookup(ctx, t) : await runTool(ctx, t.name, t.input);
        return { type: "tool_result" as const, tool_use_id: t.id, content: out.content, is_error: out.isError };
      }),
    );
    messages.push({ role: "user", content: results });
  }

  return buildKit(ctx, null, "The agent didn't finish within its limits.");
}

function refuseLookup(ctx: RunContext, t: Anthropic.Beta.BetaToolUseBlock) {
  ctx.trace.push({
    id: ctx.nextId(),
    kind: "validator",
    label: `${t.name} not run`,
    input: (t.input ?? {}) as Record<string, unknown>,
    outputSummary: "Lookups were closed for this kit, so Claude was asked to finish.",
    excluded: [],
    ms: 0,
    status: "gap",
  });
  return { content: LOOKUPS_CLOSED, isError: true };
}
