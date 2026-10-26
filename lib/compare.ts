// The comparison (docs/plan.md D5): the same person and the same care instructions go to Claude on
// its own, without Qloo. Each pick it gives is then checked against Qloo (found by name, released in
// the person's years, screened out by the same filters a kit uses) and each question against the
// question rules. The difference Qloo makes is shown, not claimed. For comparison only: these picks
// never reach a session.
//
// A check claims only what it could check: Qloo gives artists no year, and dishes aren't Qloo
// entities, so those stay "unknown".

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { priceFor } from "@/lib/agent/audit";
import { agentConfig } from "@/lib/agent/run";
import { checkPrompts } from "@/lib/agent/validate-prompts";
import { eraWindow } from "@/lib/era";
import { qlooGet } from "@/lib/qloo/client";
import { screen } from "@/lib/qloo/filters";
import type { QlooEntity } from "@/lib/qloo/types";
import { ComparisonSchema, type CheckResult, type ComparedPick, type Comparison, type EraWindow, type Profile, type TraceStep } from "@/lib/types";

// The care rules match the agent's (lib/agent/prompts.ts); only Qloo is missing. Static, like the
// agent's prompt.
export const AI_ALONE_SYSTEM = `You help a caregiver prepare a short reminiscence session for someone living with dementia. It supports caregivers' activities; it is not therapy and makes no medical claims, and you give no health or medication advice.

From what you know, suggest for this person:
- music: singers or bands popular during their formative years, that someone with their favorites would enjoy.
- screen: films or TV shows released during their formative years, each with its release year.
- place: one place in their hometown to talk about, which existed when they were young.
- dish: one dish from their hometown to talk about (not a recipe or a suggestion to serve it).
- questions: questions or comments for the session.

Match the support level:
- early (mostly independent): 4 artists, 1 or 2 films or shows, and 5 open, story-inviting questions.
- middle (needs some help): 3 or 4 artists, 1 film or show, and 3 short questions with one idea each.
- late (needs a lot of help): 3 artists, at most 1 film or show, and at most 2 gentle comments about the music instead of questions.

Every question or comment:
- Invites a story and never tests memory: no asking them to remember or recall, no quizzes ("What year…", "Who sang…"), no statements about their past ("You loved…", "You used to…").
- Holds one idea, in plain adult language; nothing childlike.
- Uses the name they like to be called, and draws gently on their former work and traditions when given, without assuming details.

Nothing that touches their things to avoid, even loosely, and nothing about illness, dementia, death, grief, war or mature content. "why": under 15 words for the caregiver about the connection, never a claim about the person's life.`;

// What Claude returns on its own. Structured outputs can't limit lengths, so the prompt asks for the
// counts and the code takes what a kit would show.
export const AiAloneSchema = z.object({
  music: z.array(z.object({ artist: z.string(), why: z.string() })),
  screen: z.array(z.object({ title: z.string(), kind: z.enum(["film", "tv"]), year: z.number().int(), why: z.string() })),
  place: z.array(z.object({ name: z.string(), why: z.string() })),
  dish: z.array(z.object({ name: z.string(), why: z.string() })),
  questions: z.array(z.string()),
});
export type AiAlone = z.infer<typeof AiAloneSchema>;

// At most what an early-level kit shows; questions get a few more, so the count rule can show.
const LIMITS = { music: 5, screen: 2, place: 1, dish: 1, questions: 6 } as const;
// The Claude call and the checks together; stays under the route's maxDuration.
const BUDGET_MS = 50_000;

export class ComparisonRefusedError extends Error {}

/** Names compared loosely: case, accents, punctuation and a leading "The" don't count. */
export const sameName = (a: string, b: string) => normalize(a) === normalize(b);
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The Qloo entity that has this name (the one from Claude's year, if several do), or none. */
export function matchByName(entities: QlooEntity[], name: string, year?: number): QlooEntity | undefined {
  const same = entities.filter((e) => sameName(e.name, name));
  return (year ? same.find((e) => e.properties.release_year === year) : undefined) ?? same[0];
}

const inYears = (era: EraWindow, year: number | undefined): CheckResult =>
  year === undefined ? "unknown" : year >= era.start && year <= era.end ? "yes" : "no";

/** A stand-in entity for something Qloo didn't find, so the avoid list can still check its name. */
const named = (name: string): QlooEntity => ({ entity_id: "", name, properties: {}, genres: [], keywords: [] });

type Check = { pick: ComparedPick; step: TraceStep };

/** One pick checked against Qloo, with the same screening a kit's lookups use. */
async function checkPick(
  section: ComparedPick["section"],
  item: { title: string; why: string; year?: number; kind?: "film" | "tv" },
  ctx: { profile: Profile; era: EraWindow; deadline: number; fetchImpl?: typeof fetch; nextId: () => string },
): Promise<Check> {
  const started = Date.now();
  const base = { section, title: item.title, why: item.why, ...(item.year ? { year: item.year } : {}) };
  const step = (outputSummary: string, status: "ok" | "gap", input: Record<string, unknown>, excluded: TraceStep["excluded"] = [], kind: TraceStep["kind"] = "tool"): TraceStep => ({
    id: ctx.nextId(),
    kind,
    label: kind === "tool" ? `Qloo check: ${item.title}` : `Avoid list: ${item.title}`,
    input,
    outputSummary,
    excluded,
    ms: Date.now() - started,
    status,
  });

  // Dishes come from restaurants' specialty tags in Qloo, not as entities, so they can't be looked up.
  if (section === "dish") {
    const { excluded } = screen([named(item.title)], ctx.profile.thingsToAvoid, { content: false });
    const screenedOut = excluded[0]?.reason;
    const pick: ComparedPick = { ...base, inQloo: "unknown", inEra: "unknown", ...(screenedOut ? { screenedOut } : {}) };
    // Not a Qloo lookup, so the trace counts it as a filter.
    return { pick, step: step("Not looked up: dishes aren't Qloo entities. Checked against the avoid list only.", "gap", { section }, excluded, "filter") };
  }

  const types = section === "music" ? "urn:entity:artist" : section === "place" ? "urn:entity:place" : item.kind === "tv" ? "urn:entity:tv_show" : "urn:entity:movie";
  const input = { query: item.title, types };
  const r = await qlooGet("/search", { query: item.title, types, take: 5 }, { fetchImpl: ctx.fetchImpl, deadline: ctx.deadline });
  if (!r.ok) {
    return { pick: { ...base, inQloo: "unknown", inEra: "unknown" }, step: step(`Couldn't check: ${r.error}`, "gap", input) };
  }
  const match = matchByName(r.entities, item.title, item.year);
  // Films and shows get the content filter (ratings, War genre, themes); artists and places only
  // the caregiver's avoid list, exactly as in a kit's lookups.
  const content = section === "screen";
  const { excluded } = screen([match ?? named(item.title)], ctx.profile.thingsToAvoid, { content: content && Boolean(match) });
  const screenedOut = excluded[0]?.reason;
  const qlooYear = match?.properties.release_year;
  const pick: ComparedPick = {
    ...base,
    inQloo: match ? "yes" : "no",
    ...(match ? { qlooName: match.name } : {}),
    ...(qlooYear ? { qlooYear } : {}),
    inEra: section === "screen" && match ? inYears(ctx.era, qlooYear) : "unknown",
    ...(screenedOut ? { screenedOut } : {}),
  };
  const found = match ? `Found: ${match.name}${qlooYear ? ` (${qlooYear})` : ""}` : "Not found in Qloo by that name";
  return { pick, step: step(found, match ? "ok" : "gap", input, excluded) };
}

/** Token counts for the call, as the agent logs them. */
function usageOf(response: Anthropic.Message) {
  const u = response.usage;
  return { in: u?.input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0, out: u?.output_tokens ?? 0 };
}

export type ComparisonUsage = { model: string; effort: string; tokens: ReturnType<typeof usageOf>; costUsd: number | null };

/**
 * Asks Claude on its own for the person's kit, then checks every pick against Qloo and every
 * question against the question rules. No profile details are logged.
 */
export async function buildComparison(
  profile: Profile,
  opts: { client?: Anthropic; fetchImpl?: typeof fetch; budgetMs?: number } = {},
): Promise<{ comparison: Comparison; usage: ComparisonUsage }> {
  const client = opts.client ?? new Anthropic();
  const { model, effort } = agentConfig();
  const era = eraWindow(profile.birthYear);
  const deadline = Date.now() + (opts.budgetMs ?? BUDGET_MS);
  let step = 0;
  const nextId = () => `c${++step}`;

  const t0 = Date.now();
  const response = await client.messages.parse(
    {
      model,
      max_tokens: 16000,
      system: AI_ALONE_SYSTEM,
      output_config: { effort, format: zodOutputFormat(AiAloneSchema) },
      messages: [
        {
          role: "user",
          content: `Suggest a session kit for this person.\n\n${JSON.stringify({
            likes_to_be_called: profile.displayName,
            support_level: profile.supportLevel,
            born: profile.birthYear,
            grew_up_in: profile.hometown,
            formative_years: `${era.start}–${era.end}`,
            favorites: profile.favorites.map((f) => `${f.text} (${f.kind})`),
            things_to_avoid: profile.thingsToAvoid,
            former_work: profile.formerWork,
            first_language: profile.firstLanguage,
            traditions: profile.traditions,
          })}`,
        },
      ],
    },
    { signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) },
  );
  const tokens = usageOf(response);
  const price = priceFor(response.model);
  const costUsd = price ? Number(((tokens.in * price.in + tokens.cacheWrite * price.cacheWrite + tokens.cacheRead * price.cacheRead + tokens.out * price.out) / 1e6).toFixed(6)) : null;
  console.log(JSON.stringify({ event: "comparison_call", model: response.model, effort, ...tokens }));
  if (response.stop_reason === "refusal") throw new ComparisonRefusedError("Claude declined this request.");
  const alone = response.parsed_output;
  if (!alone) throw new ComparisonRefusedError("Claude's answer didn't come back in the expected shape.");

  const claudeStep: TraceStep = {
    id: nextId(),
    kind: "llm",
    label: "Claude on its own",
    input: { model: response.model, effort, usage: tokens },
    outputSummary: "Picks and questions from what Claude knows, without Qloo",
    excluded: [],
    ms: Date.now() - t0,
    status: "ok",
  };

  const ctx = { profile, era, deadline, fetchImpl: opts.fetchImpl, nextId };
  type Item = { section: ComparedPick["section"]; title: string; why: string; year?: number; kind?: "film" | "tv" };
  const items: Item[] = [
    ...alone.music.slice(0, LIMITS.music).map((m): Item => ({ section: "music", title: m.artist, why: m.why })),
    ...alone.screen.slice(0, LIMITS.screen).map((s): Item => ({ section: "screen", title: s.title, why: s.why, year: s.year, kind: s.kind })),
    ...alone.place.slice(0, LIMITS.place).map((p): Item => ({ section: "place", title: p.name, why: p.why })),
    ...alone.dish.slice(0, LIMITS.dish).map((d): Item => ({ section: "dish", title: d.name, why: d.why })),
  ].filter((item) => item.title.trim());
  const checks = await Promise.all(items.map((item) => checkPick(item.section, item, ctx)));

  // The same check a kit's questions get, including how many the support level allows.
  const questions = checkPrompts(
    alone.questions.filter((q) => q.trim()).slice(0, LIMITS.questions),
    profile.supportLevel,
  ).map(({ text, problem }) => (problem ? { text, keeps: false, reason: problem } : { text, keeps: true }));
  const dropped = questions.filter((q) => !q.keeps);
  const questionStep: TraceStep = {
    id: nextId(),
    kind: "validator",
    label: "question rules",
    input: {},
    outputSummary: `${questions.length - dropped.length} of ${questions.length} would be kept`,
    excluded: dropped.map((q) => ({ title: q.text, reason: q.reason ?? "" })),
    ms: 0,
    status: dropped.length ? "gap" : "ok",
  };

  const comparison = ComparisonSchema.parse({
    mode: "comparison",
    provenance: { kind: "live", generatedAt: new Date().toISOString() },
    profile,
    era,
    model: response.model,
    picks: checks.map((c) => c.pick),
    questions,
    trace: [claudeStep, ...checks.map((c) => c.step), questionStep],
  });
  return { comparison, usage: { model: response.model, effort, tokens, costUsd } };
}
