// The agent loop (docs/plan.md §7.2). The usual Qloo lookups run in code first, including music
// for a modern favorite (music_from_film) and for the caregiver's traditions (one short call asks
// Claude for an artist's name); Claude then picks from what came back and writes the questions in
// a single call. It can still call the tools to fix a wrong match. The tools enforce the rules;
// buildKit() keeps only grounded picks.
//
// Guardrails: at most MAX_TURNS Claude calls and one deadline for the whole build, so the route
// answers before its function limit. Near the end Claude is asked to call submit_kit and further
// lookups are refused, so the loop ends with what it has.
//
// Every request repeats the same system prompt and tools, and the history only grows. Thinking
// blocks are bound to that prefix: changing it, even removing a tool, makes the API reject the next
// request on accounts created on or after Aug 31, 2026.
//
// Tokens: Claude reads short handles (a1, m2) instead of Qloo's 36-character IDs. The tools and
// system prompt are cached by one breakpoint on the system prompt, which comes after the tools, so
// kits started within 5 minutes of each other read them back cheaply. The person's message isn't
// cached: a kit built in one call would never read it back, so caching it would only add the write
// premium. Each call's token use goes into the trace and the server log.

import Anthropic from "@anthropic-ai/sdk";
import { eraWindow } from "@/lib/era";
import type { EraWindow, Kit, Profile } from "@/lib/types";
import { lookUpTradition, RunContext, runTool, TOOLS, type TraditionMusic } from "@/lib/qloo/tools";
import { buildKit } from "./kit";
import { SUBMIT_KIT, SYSTEM_PROMPT, type Submission } from "./prompts";

// One call is the usual kit; the rest leave room to fix a problem and still finish.
const MAX_TURNS = 4;
// The whole build, Qloo and Claude together. Stays under the route's maxDuration (120 s) with room
// to check and send the kit.
export const BUDGET_MS = 100_000;
// With less than this left, the next turn is the last one.
const LAST_TURN_MS = 40_000;
// Not worth starting a Claude turn with less than this left.
const MIN_TURN_MS = 5_000;
// The short traditions call answers with a name; past this, the kit goes on without it.
const TRADITION_CALL_MS = 20_000;

const ALL_TOOLS = [...TOOLS, SUBMIT_KIT];
export const FINISH_NOW = "That's all the lookups for this kit. Call submit_kit now with what you have, and use gaps for anything missing.";
const LOOKUPS_CLOSED = JSON.stringify({ error: "Lookups are closed for this kit. Call submit_kit with what you have." });
const OUT_OF_TIME = "The agent ran out of time before finishing.";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// Team rule (CLAUDE.md): Claude Haiku 5.5 by default. Sonnet or Opus only after the team approves a
// switch backed by a smoke-check audit, recorded in CLAUDE_MODEL_APPROVAL, which must name the model
// (for example "claude-sonnet-5-5 approved 2026-10-21 by Abil and Prathibha, audits/....md").
// Without that, the request falls back to Haiku and the server log says so.
export const DEFAULT_MODEL = "claude-haiku-5-5";

export function agentConfig() {
  const requested = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
  const approval = process.env.CLAUDE_MODEL_APPROVAL?.trim() ?? "";
  const approved = requested.startsWith("claude-haiku") || approval.includes(requested);
  if (!approved) console.warn(JSON.stringify({ event: "model_not_approved", requested, using: DEFAULT_MODEL }));
  const model = approved ? requested : DEFAULT_MODEL;
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

/**
 * The fallback when the code couldn't find music for the caregiver's traditions: Claude looks it
 * up in the loop (two more calls). Qloo's search matches names, so "Catholic hymns" alone finds
 * bands called "Hymns"; the lookup has to start from an artist's name.
 */
export function traditionsToDo(traditions: string | undefined): string | undefined {
  if (!traditions?.trim()) return undefined;
  return `Before submit_kit: the caregiver named traditions (${JSON.stringify(traditions.trim())}). Unless a favorite is mainly known for them, call resolve_favorite with one well-known artist of that tradition who was popular during the person's formative years (an artist's name, not the tradition's words: Qloo's search matches names; music takes its era from this seed), then get_music seeded with it, and include fitting artists from that result in music.`;
}

/** The question for the short traditions call. Only the traditions and the years go to Claude. */
export function traditionQuestion(traditions: string, era: EraWindow) {
  return `A caregiver noted these traditions for a person whose formative years were ${era.start}–${era.end}: ${JSON.stringify(traditions.trim())}. Name one well-known recording artist associated with them whose records were popular in those years. Reply with the artist's name only, or "none" if no artist fits.`;
}

/** The artist's name from the short call's reply, or null for "none" or anything that isn't a name. */
export function artistFromReply(text: string): string | null {
  const name = (text.trim().split("\n")[0] ?? "").trim().replace(/^["'“‘*]+|["'”’*.]+$/g, "").trim();
  if (!name || /^none\b/i.test(name) || name.length > 60 || name.split(/\s+/).length > 6) return null;
  return name;
}

/**
 * Music for the caregiver's traditions, found before the main call so Claude doesn't spend two
 * more calls on it: one short call with no tools and no thinking asks Claude for an artist of the
 * traditions, then the code looks that artist up in Qloo (lookUpTradition). If the call fails or
 * Qloo has no match, Claude is asked to do it in the loop instead (traditionsToDo).
 */
async function musicForTraditions(
  ctx: RunContext,
  client: Anthropic,
  model: string,
): Promise<{ music?: TraditionMusic; toDo?: string }> {
  const traditions = ctx.profile.traditions?.trim();
  if (!traditions) return {};
  const fallback = { toDo: traditionsToDo(traditions) };
  const left = Math.min(ctx.deadline - Date.now(), TRADITION_CALL_MS);
  if (left < MIN_TURN_MS) return fallback;

  const t0 = Date.now();
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create(
      {
        model,
        max_tokens: 1000,
        // A name is all this needs. Haiku runs it without thinking (allowed at medium effort and
        // below); Opus 5.5 and Sonnet 5.5 refuse disabled thinking, so they get the lowest effort.
        ...(model.startsWith("claude-haiku") ? { thinking: { type: "disabled" as const } } : {}),
        output_config: { effort: "low" },
        messages: [{ role: "user", content: traditionQuestion(traditions, ctx.era) }],
        ...(model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
      },
      { signal: AbortSignal.timeout(left) },
    );
  } catch (err) {
    // A spend limit or outage also stops the main call, which reports it; here the kit just falls back.
    console.warn(JSON.stringify({ event: "traditions_call_failed", error: err instanceof Error ? err.name : String(err) }));
    return fallback;
  }

  const usage = usageOf(response);
  console.log(JSON.stringify({ event: "claude_turn", turn: 0, purpose: "traditions", model: response.model, effort: "low", ...usage }));
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const artist = response.stop_reason === "refusal" ? null : artistFromReply(text);
  ctx.trace.push({
    id: ctx.nextId(),
    kind: "llm",
    label: "Claude, an artist for the traditions",
    input: { model: response.model, effort: "low", usage },
    outputSummary: artist ? `Named ${artist}` : "No artist named",
    excluded: [],
    ms: Date.now() - t0,
    status: artist ? "ok" : "gap",
  });
  if (!artist) return {};
  const music = await lookUpTradition(ctx, artist);
  return music ? { music } : fallback;
}

type ToolResult = Record<string, unknown>;
type Candidate = { id: string; year?: number };
type Resolved = { favorite: string; kind: string; candidates?: Candidate[]; error?: string };

/**
 * The lookups Claude would otherwise ask for in its first turn, run in code: each favorite, then
 * music, films, TV, places and dishes seeded with the top match for each favorite. Music takes its
 * era from its seeds, so a film or show from after the formative years doesn't seed it; with no
 * other seed, music is seeded with the top film from the person's era instead. Qloo gives artists
 * no year, so when only artists seed music, a second list seeded with the top film
 * (music_from_film) lets Claude replace a modern favorite's music without another call.
 */
export async function lookUpFirst(ctx: RunContext) {
  const look = async (name: string, input: Record<string, unknown>) => JSON.parse((await runTool(ctx, name, input)).content) as ToolResult;

  const favorites: Resolved[] = await Promise.all(
    ctx.profile.favorites.map(async (f) => ({
      favorite: f.text,
      kind: f.kind,
      ...((await look("resolve_favorite", { name: f.text, kind: f.kind })) as Pick<Resolved, "candidates" | "error">),
    })),
  );
  const top = favorites.flatMap((f) => f.candidates?.slice(0, 1) ?? []);
  if (!top.length) return { favorites_resolved: favorites, lookups: undefined };

  const seeds = top.map((c) => c.id);
  const inEra = top.filter((c) => !(c.year && c.year > ctx.era.end));
  const eraSeeds = inEra.map((c) => c.id);
  const onlyArtists = inEra.every((c) => !c.year);
  const topFilm = (m: ToolResult) => (m.titles as Candidate[] | undefined)?.[0]?.id;
  // Music seeded with the top film, unless that film already seeds music.
  const filmSeed = (m: ToolResult) => {
    const film = topFilm(m);
    return film && !eraSeeds.includes(film) ? film : undefined;
  };

  const moviesLookup = look("get_screen", { seed_ids: seeds, kind: "movie" });
  const [movies, tv, places, dish, eraMusic, filmMusic] = await Promise.all([
    moviesLookup,
    look("get_screen", { seed_ids: seeds, kind: "tv" }),
    look("get_places", { seed_ids: seeds }),
    look("get_dish", { seed_ids: seeds }),
    eraSeeds.length ? look("get_music", { seed_ids: eraSeeds }) : null,
    // Starts as soon as the films arrive: it needs the top one.
    onlyArtists ? moviesLookup.then((m) => (filmSeed(m) ? look("get_music", { seed_ids: [filmSeed(m)] }) : null)) : null,
  ]);
  const film = topFilm(movies);
  const music = eraMusic ?? filmMusic ?? { error: "No seed for music." };
  const musicSeeds = eraMusic ? eraSeeds : filmMusic && film ? [film] : [];
  // Artists already in music aren't repeated.
  const inMusic = new Set(((eraMusic?.artists ?? []) as { id: string }[]).map((a) => a.id));
  const fromFilm = eraMusic && filmMusic?.artists ? (filmMusic.artists as { id: string }[]).filter((a) => !inMusic.has(a.id)) : [];

  return {
    favorites_resolved: favorites,
    lookups: { seeds, music_seeds: musicSeeds, music, ...(fromFilm.length ? { music_from_film: fromFilm } : {}), movies, tv, places, dish },
  };
}

/** Tradition music minus artists Claude already has in music or music_from_film. */
function withoutRepeats(tradition: TraditionMusic, lookups: { music?: ToolResult; music_from_film?: { id: string }[] } | undefined) {
  const shown = new Set([...((lookups?.music?.artists ?? []) as { id: string }[]), ...(lookups?.music_from_film ?? [])].map((a) => a.id));
  return { artist: tradition.artist, artists: tradition.artists.filter((a) => !shown.has(a.id)) };
}

/** Token counts for one call, as logged and kept in the trace (no profile details). */
function usageOf(response: Anthropic.Beta.BetaMessage) {
  const u = response.usage;
  return {
    in: u?.input_tokens ?? 0,
    cacheWrite: u?.cache_creation_input_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
    out: u?.output_tokens ?? 0, // includes thinking, which is billed as output
  };
}

export async function buildLiveKit(
  profile: Profile,
  opts: { client?: Anthropic; fetchImpl?: typeof fetch; budgetMs?: number } = {},
): Promise<Kit> {
  const client = opts.client ?? new Anthropic();
  const { model, effort } = agentConfig();
  const deadline = Date.now() + (opts.budgetMs ?? BUDGET_MS);
  const ctx = new RunContext(profile, eraWindow(profile.birthYear), opts.fetchImpl, deadline);

  // The traditions call needs no Qloo result, so it runs alongside the usual lookups.
  const [found, tradition] = await Promise.all([lookUpFirst(ctx), musicForTraditions(ctx, client, model)]);
  const lookups = tradition.music ? { ...found.lookups, tradition_music: withoutRepeats(tradition.music, found.lookups) } : found.lookups;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Build a session kit for this person.\n\n${JSON.stringify({
        likes_to_be_called: profile.displayName,
        support_level: profile.supportLevel,
        born: profile.birthYear,
        grew_up_in: profile.hometown,
        formative_years: `${ctx.era.start}–${ctx.era.end}`,
        things_to_avoid: profile.thingsToAvoid,
        former_work: profile.formerWork,
        first_language: profile.firstLanguage,
        traditions: profile.traditions,
        favorites_resolved: found.favorites_resolved,
        lookups,
        to_do: tradition.toDo,
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
    const usage = usageOf(response);
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
