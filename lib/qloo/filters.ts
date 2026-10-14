// Safety and relevance rules applied to every Qloo result before Claude or the caregiver sees it.
// Design and evidence: docs/approach.md (D3, D4), docs/phase2-recheck.md.

import type { Excluded, QlooEntity } from "./types";

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

const PROFANE_TITLE_WORDS = ["cocksucker", "fuck", "shit"];

/** Why a title is unsafe for a reminiscence session, or null if it's fine. */
export function contentConcern(e: QlooEntity): string | null {
  const rating = e.properties.content_rating;
  if (rating && BLOCKED_RATINGS.has(rating)) return `Mature content: rated ${rating}.`;
  if (e.genres.includes("War")) return "War film or series.";
  const themes = (e.properties.plot_themes_description ?? "").toLowerCase();
  const theme = SENSITIVE_THEMES.find((p) => themes.includes(p));
  if (theme) return `Sensitive theme: ${theme}.`;
  const title = e.name.toLowerCase();
  if (PROFANE_TITLE_WORDS.some((w) => title.includes(w))) return "Explicit title.";
  return null;
}

// ---------- The caregiver's "things to avoid" ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches a caregiver term as a whole word, singular or plural ("hospitals" ~ "Hospital"). */
function termPattern(term: string): RegExp | null {
  const t = term.trim().toLowerCase();
  if (!t || t === "none") return null;
  const singular = t.replace(/(es|s)$/, "");
  const forms = [...new Set([t, singular].filter((f) => f.length >= 3))].map(escapeRe);
  if (!forms.length) return null;
  return new RegExp(`\\b(${forms.join("|")})(s|es)?\\b`, "i");
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
    const re = termPattern(term);
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
