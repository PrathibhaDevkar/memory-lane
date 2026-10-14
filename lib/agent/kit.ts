// Turns Claude's submit_kit call into a Kit. Grounding happens here: every pick must be an ID a
// tool returned in this run, and names and years come from Qloo, not from Claude's text.

import { spotifySearchUrl, youtubeSearchUrl } from "@/lib/links";
import type { DishItem, Kit, MediaItem, PlaceItem } from "@/lib/types";
import type { RunContext, SeenKind } from "@/lib/qloo/tools";
import type { Submission } from "./prompts";
import { validatePrompts } from "./validate-prompts";

const DISH_CAVEAT = "Something to talk about, not to serve. Check diet, chewing and swallowing needs before offering any food.";
const MAX = { music: 5, screen: 2, dish: 1, place: 1 };

type Section = keyof typeof MAX;

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const humanize = (slug: string) => slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const tidy = (why: string) => why.trim().slice(0, 240);

export function buildKit(ctx: RunContext, sub: Submission | null, failure?: string): Kit {
  const started = Date.now();
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

  const prompts = validatePrompts(sub?.prompts ?? []);

  ctx.trace.push({
    id: ctx.nextId(),
    kind: "validator",
    label: "grounding + question check",
    input: {},
    outputSummary: `${ungrounded.length} ungrounded picks removed; ${prompts.kept.length} questions kept (${prompts.open} open-ended), ${prompts.dropped.length} dropped.`,
    excluded: [...ungrounded, ...prompts.dropped],
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
    trace: ctx.trace,
  };
}
