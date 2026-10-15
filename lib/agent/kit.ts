// Turns Claude's submit_kit call into a Kit. Grounding happens here: every pick must be an ID a
// tool returned in this run, and names and years come from Qloo, not from Claude's text.

import { KIT_LIMITS } from "@/lib/care";
import { spotifySearchUrl, youtubeSearchUrl } from "@/lib/links";
import type { ActivityIdea, DishItem, Kit, MediaItem, PlaceItem, SupportLevel } from "@/lib/types";
import type { RunContext, SeenKind } from "@/lib/qloo/tools";
import type { Submission } from "./prompts";
import { validatePrompts } from "./validate-prompts";

const DISH_CAVEAT = "Something to talk about, not to serve. Check diet, chewing and swallowing needs before offering any food.";
type Section = "music" | "screen" | "dish" | "place";

// Activity ideas are model-written suggestions (D12): short, adult, and physically safe.
const UNSAFE_IDEA = /\b(eat|eating|taste|tasting|food|snack|drink|swallow|coins?|buttons?|beads?|marbles?|pins?|needles?|scissors|knife|knives|sharp|hot water|candles?|matches)\b/i;
const CHILDLIKE_IDEA = /\b(colou?ring book|nursery|toddler|baby toys?|sticker chart|playdough)\b/i;

export function checkIdeas(ideas: string[], level: SupportLevel) {
  const kept: ActivityIdea[] = [];
  const dropped: { title: string; reason: string }[] = [];
  for (const raw of ideas) {
    const text = raw.trim();
    const reason =
      level === "early" ? "Ideas are only added for people who need more support."
      : !text || text.length > 200 ? "Empty or too long."
      : UNSAFE_IDEA.test(text) ? "Involves food or small, sharp or hot items."
      : CHILDLIKE_IDEA.test(text) ? "Not adult."
      : kept.length >= 3 ? "More than 3 ideas."
      : null;
    if (reason) dropped.push({ title: text || "(empty)", reason });
    else kept.push({ text, source: "llm" });
  }
  return { kept, dropped };
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const humanize = (slug: string) => slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const tidy = (why: string) => why.trim().slice(0, 240);

export function buildKit(ctx: RunContext, sub: Submission | null, failure?: string): Kit {
  const started = Date.now();
  const level = ctx.profile.supportLevel;
  const MAX = { ...KIT_LIMITS[level], dish: 1, place: 1 };
  const ungrounded: { title: string; reason: string }[] = [];

  // A pick counts only if a tool returned that ID, as the right kind of thing.
  const grounded = (id: string, kinds: SeenKind[], section: Section) => {
    const seen = ctx.seen.get(id);
    if (seen && kinds.includes(seen.kind)) return seen;
    ungrounded.push({ title: `${section}: ${id}`, reason: "Not returned by Qloo in this run; removed." });
    return null;
  };

  const music: MediaItem[] = [];
  for (const p of sub?.music ?? []) {
    const s = grounded(p.id, ["artist"], "music");
    if (s && music.length < MAX.music)
      music.push({ source: "qloo", qlooId: p.id, kind: "artist", title: s.name, whyPicked: tidy(p.why), searchUrl: spotifySearchUrl(s.name) });
  }

  const screen: MediaItem[] = [];
  for (const p of sub?.screen ?? []) {
    const s = grounded(p.id, ["movie", "tv"], "screen");
    if (s && screen.length < MAX.screen) {
      const kind = s.kind === "tv" ? "tv" : "movie";
      screen.push({
        source: "qloo",
        qlooId: p.id,
        kind,
        title: s.name,
        year: s.year,
        whyPicked: tidy(p.why),
        searchUrl: youtubeSearchUrl(`${s.name} ${s.year ?? ""} ${kind === "tv" ? "opening" : "trailer"}`.replace(/\s+/g, " ").trim()),
      });
    }
  }

  const dish: DishItem[] = [];
  for (const p of sub?.dish ?? []) {
    const s = grounded(p.tag_id, ["dish"], "dish");
    if (s && dish.length < MAX.dish) {
      // Claude may only reword the dish with the dish's own words; otherwise use Qloo's name.
      const slugWords = new Set(words(s.name));
      const name = words(p.name).every((w) => slugWords.has(w)) && p.name.trim() ? p.name.trim() : humanize(s.name);
      dish.push({ source: "qloo", name, qlooTagId: p.tag_id, fromPlace: s.place, caveat: DISH_CAVEAT });
    }
  }

  const place: PlaceItem[] = [];
  for (const p of sub?.place ?? []) {
    const s = grounded(p.id, ["place"], "place");
    if (s && place.length < MAX.place)
      place.push({ source: "qloo", qlooId: p.id, name: s.name, genre: s.genre, whyPicked: `${tidy(p.why)} A place to talk about, not a visit suggestion.` });
  }

  const prompts = validatePrompts(sub?.prompts ?? [], level);
  const ideas = checkIdeas(sub?.activity_ideas ?? [], level);

  ctx.trace.push({
    id: ctx.nextId(),
    kind: "validator",
    label: "grounding + question check",
    input: {},
    outputSummary: `Support level: ${level}. ${ungrounded.length} ungrounded picks removed; ${prompts.kept.length} questions kept (${prompts.open} open-ended${prompts.meetsLevel ? "" : `, fewer than ${KIT_LIMITS[level].minOpenPrompts} wanted`}), ${prompts.dropped.length} dropped; ${ideas.kept.length} activity ideas kept, ${ideas.dropped.length} dropped.`,
    excluded: [...ungrounded, ...prompts.dropped, ...ideas.dropped],
    ms: Date.now() - started,
    status: "ok",
  });

  const reason = (section: Section) =>
    failure ??
    sub?.gaps.find((g) => g.section === section)?.reason ??
    "Qloo didn't return anything suitable for this section.";
  const section = <T,>(items: T[], name: Section) =>
    items.length ? { status: "ok" as const, items } : { status: "gap" as const, items: [], gapReason: reason(name) };

  return {
    mode: "memory_lane",
    provenance: { kind: "live", generatedAt: new Date().toISOString().slice(0, 10) },
    profile: ctx.profile,
    era: ctx.era,
    music: section(music, "music"),
    screen: section(screen, "screen"),
    dish: section(dish, "dish"),
    place: section(place, "place"),
    prompts: prompts.kept,
    activityIdeas: ideas.kept,
    trace: ctx.trace,
  };
}
