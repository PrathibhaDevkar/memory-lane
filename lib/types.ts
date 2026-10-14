// Shared contract between the server (/api/kit, agent, Qloo tools) and the UI.
// Each zod schema is the single source of truth: TypeScript types are inferred from it,
// and the same schema validates request bodies, fixture files and (later) agent output.
// See docs/implementation-plan.md §6.

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

export const ProfileSchema = z.object({
  displayName: z.string({ error: "Add a first name or nickname." }).trim().min(1, "Add a first name or nickname.").max(60, "Keep the name under 60 characters."),
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
    .max(10, "Add up to 10 things to avoid."),
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
  trace: z.array(TraceStepSchema),
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
