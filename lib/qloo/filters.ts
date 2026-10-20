// Safety and relevance rules applied to every Qloo result before Claude or the caregiver sees it.
// Design: docs/plan.md §3 (D3, D4). Evidence: docs/research.md §2.

import type { Excluded, QlooEntity } from "./types";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- D3: content safety ----------

const BLOCKED_RATINGS = new Set(["R", "NC-17", "X", "TV-MA"]);

// Matched against Qloo's one-sentence theme summary only: it says what a title is *about*.
// Keyword tags are not used here; they record minor plot details and dropped classics like
// The Sound of Music ("Nazi") in the Oct 14 re-check.
const SENSITIVE_THEMES = [
  "dementia",
  "alzheimer",
  "cognitive decline",
  "memory decline",
  "memory loss",
  "genocide",
  "holocaust",
  "nazi",
  "totalitarian",
  "suicide",
  "drug use",
  "addiction",
  "terminal illness",
  "cancer",
  "deathbed",
  "grief",
  "sexual abuse",
  "rape",
];

// Matched at the start of a word, so "rape" doesn't fire on "therapeutic", "grapes" or "skyscraper".
const THEME_PATTERNS = SENSITIVE_THEMES.map((theme) => ({ theme, re: new RegExp(`\\b${escapeRe(theme)}`) }));

const PROFANE_TITLE_WORDS = ["cocksucker", "fuck", "shit"];

/** Why a title is unsafe for a reminiscence session, or null if it's fine. */
export function contentConcern(e: QlooEntity): string | null {
  const rating = e.properties.content_rating;
  if (rating && BLOCKED_RATINGS.has(rating)) return `Mature content: rated ${rating}.`;
  if (e.genres.includes("War")) return "War film or series.";
  const themes = (e.properties.plot_themes_description ?? "").toLowerCase();
  const theme = THEME_PATTERNS.find(({ re }) => re.test(themes))?.theme;
  if (theme) return `Sensitive theme: ${theme}.`;
  const title = e.name.toLowerCase();
  if (PROFANE_TITLE_WORDS.some((w) => title.includes(w))) return "Explicit title.";
  return null;
}

// ---------- The caregiver's "things to avoid" ----------

// Answers that mean "nothing to avoid" rather than a word to look for.
const NOTHING = new Set(["none", "nothing", "no", "n/a", "na", "nil", "none known", "nothing to avoid"]);

// Caregivers often describe a topic instead of naming a title ("anything about hospitals",
// "songs about my mother", "war films"). The topic is matched as well as the whole line.
const LEAD_IN = /^(?:(?:anything|something|songs?|films?|movies?|shows?|music|programmes?|programs?|stories)\s+)?(?:about|to do with|related to|involving)\s+/;
const DETERMINER = /^(?:my|his|her|their|our|the|a|an|any)\s+/;
const MEDIA_TAIL = /\s+(?:films?|movies?|songs?|music|shows?|programmes?|programs?)$/;

const tidy = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

/**
 * What one line of the caregiver's list asks to avoid: the whole line, each comma-separated part
 * (so "hospitals, war" works on one line), and the topic of a description. Over-matching is the
 * safe side here.
 */
export function avoidPhrases(line: string): string[] {
  if (NOTHING.has(tidy(line))) return [];
  const phrases = new Set<string>();
  for (const part of [line, ...line.split(/[,;]/)]) {
    const p = tidy(part);
    if (!p || NOTHING.has(p)) continue;
    phrases.add(p);
    const topic = tidy(p.replace(LEAD_IN, "").replace(DETERMINER, "").replace(MEDIA_TAIL, ""));
    if (topic) phrases.add(topic);
  }
  return [...phrases];
}

/** True when the caregiver's list only says there's nothing to avoid ("none", "n/a"…). */
export const nothingToAvoid = (thingsToAvoid: string[]) => thingsToAvoid.every((line) => avoidPhrases(line).length === 0);

/** A phrase and its singular: "horses" ~ "horse", "churches" ~ "church", "war films" ~ "war film". */
function forms(phrase: string): string[] {
  const out = [phrase];
  if (phrase.endsWith("es")) out.push(phrase.slice(0, -2));
  if (phrase.endsWith("s")) out.push(phrase.slice(0, -1));
  return out.filter((f) => f.length >= 3);
}

/** Matches any of the phrases as whole words, singular or plural ("hospitals" ~ "Hospital"). */
function phrasePattern(phrases: string[]): RegExp | null {
  const all = [...new Set(phrases.flatMap(forms))].map(escapeRe);
  return all.length ? new RegExp(`\\b(${all.join("|")})(s|es)?\\b`, "i") : null;
}

/** The caregiver term this title touches, or null. Checks keywords too: here the caregiver chose the words. */
export function avoidMatch(e: QlooEntity, thingsToAvoid: string[]): string | null {
  const haystack = [
    e.name,
    ...e.genres,
    ...e.keywords,
    e.properties.plot_themes_description ?? "",
    e.properties.description ?? "",
  ].join(" | ");
  for (const term of thingsToAvoid) {
    const re = phrasePattern(avoidPhrases(term));
    if (re?.test(haystack)) return term.trim();
  }
  return null;
}

/** Splits results into kept and excluded (with reasons), caregiver's list first. */
export function screen(entities: QlooEntity[], thingsToAvoid: string[], opts: { content: boolean }) {
  const kept: QlooEntity[] = [];
  const excluded: Excluded[] = [];
  for (const e of entities) {
    const label = e.properties.release_year ? `${e.name} (${e.properties.release_year})` : e.name;
    const avoid = avoidMatch(e, thingsToAvoid);
    if (avoid) {
      excluded.push({ title: label, reason: `On the caregiver's avoid list: ${avoid}.` });
      continue;
    }
    const concern = opts.content ? contentConcern(e) : null;
    if (concern) {
      excluded.push({ title: label, reason: concern });
      continue;
    }
    kept.push(e);
  }
  return { kept, excluded };
}

// ---------- D4: places ----------

// Ranked: historic places first, then everyday landmarks, then museums (which also include
// modern pop-up attractions). Claude still checks the place existed in the person's era.
const LANDMARK_RANKS: [RegExp, number][] = [
  [/:(historical_landmark|heritage_building)$/, 0],
  [/:(market|sculpture|park)$/, 1],
  [/:[a-z_]*museum$/, 2],
];
const NOT_LANDMARK = /:(water_park|amusement_park_ride)$/;

/** Landmark rank (0 is best), or null if the place isn't a landmark. */
export function landmarkRank(e: QlooEntity): number | null {
  const genre = e.properties.primary_genre;
  if (!genre || NOT_LANDMARK.test(genre)) return null;
  for (const [re, rank] of LANDMARK_RANKS) if (re.test(genre)) return rank;
  return null;
}

/** Landmarks only, best rank first (stable within a rank, so Qloo's order is kept). */
export function landmarks(entities: QlooEntity[]): QlooEntity[] {
  return entities
    .map((e, i) => ({ e, i, rank: landmarkRank(e) }))
    .filter((x): x is { e: QlooEntity; i: number; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.e);
}

// ---------- Dishes ----------

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** A restaurant's specialty dishes, minus noisy entries ("giordano_s_house_salad", "1_2_rack_ribs"). */
export function cleanDishes(place: QlooEntity): { id: string; slug: string }[] {
  const placeSlug = slugify(place.name);
  const firstWord = placeSlug.split("_")[0];
  return (place.properties.specialty_dishes ?? [])
    .map((d) => ({ id: d.id, slug: d.id.split(":").pop() ?? "" }))
    // Drops numbered entries and house items named after the place, including possessives
    // ("gino_s_house_salad" at Gino's East).
    .filter((d) => d.slug && !/^\d/.test(d.slug) && !d.slug.startsWith(placeSlug) && !d.slug.startsWith(`${firstWord}_s_`));
}
