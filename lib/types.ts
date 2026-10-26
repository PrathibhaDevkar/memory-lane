// Shared contract between the server (/api/kit, agent, Qloo tools) and the UI.
// Each zod schema is the single source of truth: TypeScript types are inferred from it,
// and the same schema validates request bodies, fixture files and (later) agent output.
// See docs/plan.md §9.

import { z } from "zod";

// ---------- Input: what the caregiver enters ----------

export const FavoriteKindSchema = z.enum(["artist", "movie", "tv", "other"]);

// Messages are written for caregivers: the API returns them and the form shows them as-is.
export const FavoriteSchema = z.object({
  text: z.string().trim().min(1, "Write the favorite's name.").max(80, "Keep each favorite under 80 characters."),
  kind: FavoriteKindSchema,
});

// Shared with the intake form so client hints and server validation can't disagree.
export const BIRTH_YEAR_MIN = 1920;
export const BIRTH_YEAR_MAX = 1990;
export const MAX_FAVORITES = 3;
export const MAX_THINGS_TO_AVOID = 10;

// How much support the person needs today (chosen by the caregiver, not a diagnosis).
// Labels and what changes per level live in lib/care.ts.
export const SupportLevelSchema = z.enum(["early", "middle", "late"], { error: "Choose how much support they need today." });

// Optional life-story details: used for this kit only, never stored.
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} under ${max} characters.`)
    .transform((v) => v || undefined) // a blank box counts as not given
    .optional();

export const ProfileSchema = z.object({
  // Asked first. "Yes" means no kit: a sudden change is reported, not assumed to be progression.
  suddenChange: z.boolean({ error: "Answer the question about sudden changes." }),
  // The name they like to be called.
  displayName: z.string({ error: "Add the name they like to be called." }).trim().min(1, "Add the name they like to be called.").max(60, "Keep the name under 60 characters."),
  supportLevel: SupportLevelSchema,
  birthYear: z
    .number({ error: "Add the year of birth." })
    .int("Use a whole year, like 1948.")
    .min(BIRTH_YEAR_MIN, `Use a year between ${BIRTH_YEAR_MIN} and ${BIRTH_YEAR_MAX}.`)
    .max(BIRTH_YEAR_MAX, `Use a year between ${BIRTH_YEAR_MIN} and ${BIRTH_YEAR_MAX}.`),
  hometown: z.string({ error: "Add the city or town they grew up in." }).trim().min(2, "Add the city or town they grew up in.").max(80, "Keep the place under 80 characters."),
  favorites: z
    .array(FavoriteSchema, { error: "Add at least one favorite they remember." })
    .min(1, "Add at least one favorite they remember.")
    .max(MAX_FAVORITES, `Add up to ${MAX_FAVORITES} favorites.`),
  // Required on purpose: the caregiver must think about it. "none" is an allowed answer.
  thingsToAvoid: z
    .array(z.string().trim().min(1).max(80, "Keep each item under 80 characters."), {
      error: "Add at least one thing to avoid, or tick “Nothing to avoid”.",
    })
    .min(1, "Add at least one thing to avoid, or tick “Nothing to avoid”.")
    .max(MAX_THINGS_TO_AVOID, `Add up to ${MAX_THINGS_TO_AVOID} things to avoid.`),
  formerWork: optionalText(80, "their former work"),
  firstLanguage: optionalText(40, "the language"),
  traditions: optionalText(80, "traditions"),
});

// ---------- Output: the session kit ----------

export const EraWindowSchema = z
  .object({ start: z.number().int(), end: z.number().int() })
  .refine((w) => w.start <= w.end, "era start must be <= end");

// Where an item came from. "qloo" items must carry the Qloo ID that proves it (grounding);
// "llm" items exist only in the LLM-only comparison mode and are labeled as unchecked.
export const SourceSchema = z.enum(["qloo", "llm"]);

// Media is linked out, never embedded. Only search pages on these hosts are allowed,
// so neither a fixture nor the agent can put an arbitrary link in front of a caregiver.
const SEARCH_URL = /^https:\/\/(www\.youtube\.com\/results\?search_query=|open\.spotify\.com\/search\/)/;

export const MediaItemSchema = z
  .object({
    source: SourceSchema,
    qlooId: z.string().optional(),
    kind: z.enum(["artist", "movie", "tv"]),
    title: z.string().min(1),
    year: z.number().int().optional(),
    whyPicked: z.string().min(1),
    searchUrl: z.string().regex(SEARCH_URL, "must be a YouTube or Spotify search link"),
  })
  .refine((i) => i.source === "llm" || Boolean(i.qlooId), "qlooId is required when source is qloo");

export const DishItemSchema = z
  .object({
    source: SourceSchema,
    name: z.string().min(1),
    qlooTagId: z.string().optional(),
    fromPlace: z.string().optional(),
    caveat: z.string().min(1),
  })
  .refine((i) => i.source === "llm" || Boolean(i.qlooTagId), "qlooTagId is required when source is qloo");

export const PlaceItemSchema = z
  .object({
    source: SourceSchema,
    qlooId: z.string().optional(),
    name: z.string().min(1),
    genre: z.string().optional(),
    whyPicked: z.string().min(1),
  })
  .refine((i) => i.source === "llm" || Boolean(i.qlooId), "qlooId is required when source is qloo");

// A section either has items, or is an honest gap with a reason (D6: never invent data).
const section = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      status: z.enum(["ok", "gap"]),
      items: z.array(item),
      gapReason: z.string().optional(),
    })
    .refine((s) => (s.status === "ok" ? s.items.length > 0 : Boolean(s.gapReason)), {
      message: "ok sections need items; gap sections need a gapReason",
    });

export const ExcludedSchema = z.object({ title: z.string(), reason: z.string() });

export const TraceStepSchema = z.object({
  id: z.string(),
  kind: z.enum(["llm", "tool", "filter", "validator"]),
  label: z.string(),
  input: z.record(z.string(), z.unknown()),
  outputSummary: z.string(),
  excluded: z.array(ExcludedSchema),
  ms: z.number().nonnegative(),
  status: z.enum(["ok", "gap"]),
});

// How this kit was produced, shown in the UI so a cached or fixture kit is never
// mistaken for a live run.
export const ProvenanceSchema = z.object({
  kind: z.enum(["live", "cached", "fixture"]),
  generatedAt: z.string(), // ISO date of the Qloo/Claude run the kit is built from
  note: z.string().optional(),
});

// Model-written suggestions (objects to hold, textures). Never presented as Qloo data (D12).
export const ActivityIdeaSchema = z.object({ text: z.string().min(1).max(200), source: z.literal("llm") });

export const KitSchema = z.object({
  mode: z.enum(["memory_lane", "llm_only"]),
  provenance: ProvenanceSchema,
  profile: ProfileSchema,
  era: EraWindowSchema,
  music: section(MediaItemSchema),
  screen: section(MediaItemSchema),
  dish: section(DishItemSchema),
  place: section(PlaceItemSchema),
  prompts: z.array(z.string().min(1)),
  activityIdeas: z.array(ActivityIdeaSchema).max(3),
  trace: z.array(TraceStepSchema),
});

// Returned instead of a kit when the caregiver reports a sudden change (D9).
export const SafetyStopSchema = z.object({
  mode: z.literal("safety_stop"),
  message: z.string(),
  profile: ProfileSchema,
});

export const KitResponseSchema = z.union([KitSchema, SafetyStopSchema]);

// ---------- Comparison: Claude alone, checked against Qloo (docs/plan.md D5) ----------

// For a kit, the same person and instructions go to Claude without Qloo; each pick is then checked
// against Qloo, and each question against the question rules. For comparison only: these picks
// never reach a session. A check claims only what it could check: "unknown" when Qloo can't tell
// (artists have no year; dishes aren't Qloo entities).
export const CheckResultSchema = z.enum(["yes", "no", "unknown"]);

export const ComparedPickSchema = z.object({
  section: z.enum(["music", "screen", "place", "dish"]),
  title: z.string().min(1), // as Claude gave it
  year: z.number().int().optional(), // the year Claude gave (films and shows)
  why: z.string(), // Claude's reason
  inQloo: CheckResultSchema, // found by name in Qloo
  qlooName: z.string().optional(), // what it matched in Qloo
  qlooYear: z.number().int().optional(), // the release year Qloo has
  inEra: CheckResultSchema, // films and shows: released within the person's formative years
  screenedOut: z.string().optional(), // why Memory Lane's content filter or avoid list would leave it out
});

export const ComparedQuestionSchema = z.object({
  text: z.string().min(1),
  keeps: z.boolean(), // passes Memory Lane's question rules
  reason: z.string().optional(), // why the rules would drop it
});

export const ComparisonSchema = z.object({
  mode: z.literal("comparison"),
  provenance: ProvenanceSchema,
  profile: ProfileSchema,
  era: EraWindowSchema,
  model: z.string().min(1), // the Claude model that answered on its own
  picks: z.array(ComparedPickSchema),
  questions: z.array(ComparedQuestionSchema),
  trace: z.array(TraceStepSchema), // the Claude call and each Qloo check
});

export type FavoriteKind = z.infer<typeof FavoriteKindSchema>;
export type Favorite = z.infer<typeof FavoriteSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type EraWindow = z.infer<typeof EraWindowSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type DishItem = z.infer<typeof DishItemSchema>;
export type PlaceItem = z.infer<typeof PlaceItemSchema>;
export type Excluded = z.infer<typeof ExcludedSchema>;
export type TraceStep = z.infer<typeof TraceStepSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Kit = z.infer<typeof KitSchema>;
export type SupportLevel = z.infer<typeof SupportLevelSchema>;
export type ActivityIdea = z.infer<typeof ActivityIdeaSchema>;
export type SafetyStop = z.infer<typeof SafetyStopSchema>;
export type KitResponse = z.infer<typeof KitResponseSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type ComparedPick = z.infer<typeof ComparedPickSchema>;
export type ComparedQuestion = z.infer<typeof ComparedQuestionSchema>;
export type Comparison = z.infer<typeof ComparisonSchema>;
