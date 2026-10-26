// The tools Claude can call. Each one wraps Qloo and applies the rules in code, so a prompt
// can't skip them (docs/plan.md §7.1):
//   - the era window and hometown come from the caregiver's profile, never from Claude (D1)
//   - no age signal is sent (D7)
//   - every result is screened (D3 + avoid list) before Claude sees it, with reasons in the trace
//   - seeds must be IDs an earlier tool returned, so Claude can't invent one
//   - every returned item is remembered, so the final kit can be checked against it (grounding)
//   - Claude reads and writes short handles (a1, m2, d3) instead of Qloo's 36-character IDs,
//     which saves tokens both ways; the handles map back to Qloo IDs here

import type Anthropic from "@anthropic-ai/sdk";
import type { EraWindow, Profile, TraceStep } from "@/lib/types";
import { qlooGet, type QlooResult } from "./client";
import { cleanDishes, landmarks, nothingToAvoid, screen } from "./filters";
import type { Excluded, QlooEntity } from "./types";

// The lookups run in code take up to 3 favorites + 6 + 2 for traditions; the rest is room for
// Claude to fix a wrong match.
export const MAX_QLOO_CALLS = 14;

export type SeenKind = "favorite" | "artist" | "movie" | "tv" | "place" | "dish";
export type Seen = { kind: SeenKind; name: string; year?: number; genre?: string };

/** Per-request state shared by the tools and the kit builder. */
export class RunContext {
  readonly seen = new Map<string, Seen>();
  /** For each dish tag ID, the restaurants (ID → name) that listed it in this run. */
  readonly dishPlaces = new Map<string, Map<string, string>>();
  readonly trace: TraceStep[] = [];
  /** Told about each trace step as it's recorded, so the page can show progress while the kit builds. */
  onStep?: (step: TraceStep) => void;
  qlooCalls = 0;
  private step = 0;
  constructor(
    readonly profile: Profile,
    readonly era: EraWindow,
    readonly fetchImpl?: typeof fetch,
    /** Epoch ms when the kit's time budget runs out. Qloo calls don't run past it. */
    readonly deadline = Infinity,
  ) {
    // Every step is pushed onto the trace, from the tools, the agent loop and the kit builder alike.
    const push = this.trace.push.bind(this.trace);
    this.trace.push = (...steps: TraceStep[]) => {
      const length = push(...steps);
      for (const s of steps) this.onStep?.(s);
      return length;
    };
  }

  nextId() {
    return `t${++this.step}`;
  }

  private readonly idsByHandle = new Map<string, string>();
  private readonly handlesById = new Map<string, string>();
  private readonly handleCounts = new Map<string, number>();

  /** The short handle Claude sees for a Qloo ID, made on first use (a1, a2, m1…). */
  handle(id: string, prefix: string): string {
    const known = this.handlesById.get(id);
    if (known) return known;
    const n = (this.handleCounts.get(prefix) ?? 0) + 1;
    this.handleCounts.set(prefix, n);
    const handle = `${prefix}${n}`;
    this.handlesById.set(id, handle);
    this.idsByHandle.set(handle, id);
    return handle;
  }

  /** The Qloo ID behind a handle. Anything else comes back unchanged, so it fails grounding. */
  idFor(handle: string): string {
    return this.idsByHandle.get(handle) ?? handle;
  }

  get avoid() {
    return this.profile.thingsToAvoid;
  }

  async qloo(path: "/search" | "/v2/insights", params: Record<string, string | number | undefined>): Promise<QlooResult> {
    if (this.qlooCalls >= MAX_QLOO_CALLS) {
      return { ok: false, status: null, url: path, ms: 0, error: `Qloo call limit (${MAX_QLOO_CALLS}) reached for this kit` };
    }
    this.qlooCalls++;
    return qlooGet(path, params, { fetchImpl: this.fetchImpl, deadline: this.deadline });
  }
}

// ---------- Tool definitions (what Claude sees) ----------

// Short on purpose: the tools and system prompt are re-read on every call, and the lookups usually
// run in code before Claude is called (lookUpFirst in lib/agent/run.ts).
const seedIds = { type: "array", items: { type: "string" } } as const;

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "resolve_favorite",
    description: "Find a favorite in Qloo: up to 3 matches with ids and years.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["artist", "movie", "tv", "other"] },
      },
      required: ["name", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "get_music",
    description: "Artists that fans of the seeds also love. Their era comes from the seeds.",
    strict: true,
    input_schema: { type: "object", properties: { seed_ids: seedIds }, required: ["seed_ids"], additionalProperties: false },
  },
  {
    name: "get_screen",
    description: "Films or TV shows from the person's formative years that fans of the seeds also like; unsafe titles removed.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { seed_ids: seedIds, kind: { type: "string", enum: ["movie", "tv"] } },
      required: ["seed_ids", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "get_places",
    description: "Landmarks in the person's hometown, historic places first.",
    strict: true,
    input_schema: { type: "object", properties: { seed_ids: seedIds }, required: ["seed_ids"], additionalProperties: false },
  },
  {
    name: "get_dish",
    description: "Hometown restaurants with their specialty dishes.",
    strict: true,
    input_schema: { type: "object", properties: { seed_ids: seedIds }, required: ["seed_ids"], additionalProperties: false },
  },
];

// ---------- Tool implementations ----------

type ToolOutput = { content: string; isError: boolean };

const short = (s: string | undefined, n = 100) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function runTool(ctx: RunContext, name: string, input: unknown): Promise<ToolOutput> {
  const started = Date.now();
  const args = (input ?? {}) as Record<string, unknown>;
  const given = Array.isArray(args.seed_ids) ? (args.seed_ids as unknown[]).map(String) : [];
  const seeds = given.map((s) => ctx.idFor(s));
  // Music seeded with a film or show a lookup found (the hop for a modern favorite) says so.
  const fromScreen = seeds.some((id) => ["movie", "tv"].includes(ctx.seen.get(id)?.kind ?? ""));
  const label = name === "get_screen" ? `get_screen(${String(args.kind)})` : name === "get_music" && fromScreen ? "get_music(from film)" : name;
  const record = (summary: string, excluded: Excluded[], status: "ok" | "gap") =>
    ctx.trace.push({
      id: ctx.nextId(),
      kind: "tool",
      label,
      input: args,
      outputSummary: summary,
      excluded,
      ms: Date.now() - started,
      status,
    });
  const fail = (error: string) => {
    record(error, [], "gap");
    return { content: JSON.stringify({ error }), isError: true };
  };

  // Seeds must come from earlier tool results.
  if (name !== "resolve_favorite") {
    if (!seeds.length) return fail("seed_ids is empty");
    const unknown = given.filter((s) => !ctx.seen.has(ctx.idFor(s)));
    if (unknown.length) return fail(`Unknown seed ids (use ids returned by earlier results): ${unknown.join(", ")}`);
  }
  const signal = { "signal.interests.entities": seeds.join(",") };

  switch (name) {
    case "resolve_favorite": {
      const kind = String(args.kind);
      const types = { artist: "urn:entity:artist", movie: "urn:entity:movie", tv: "urn:entity:tv_show" }[kind];
      const r = await ctx.qloo("/search", { query: String(args.name ?? ""), types, take: 3 });
      if (!r.ok) return fail(r.error);
      if (!r.entities.length) return fail(`No Qloo match for "${String(args.name)}"`);
      const candidates = r.entities.map((e) => {
        // Never downgrade something a lookup already offered (an artist from get_music stays pickable).
        if (!ctx.seen.has(e.entity_id)) ctx.seen.set(e.entity_id, { kind: "favorite", name: e.name, year: e.properties.release_year });
        return { id: ctx.handle(e.entity_id, "f"), name: e.name, year: e.properties.release_year };
      });
      record(`"${String(args.name)}" → ${candidates.map((c) => c.name).join(", ")}`, [], "ok");
      return { content: JSON.stringify({ candidates }), isError: false };
    }

    case "get_music": {
      const r = await ctx.qloo("/v2/insights", { ...signal, "filter.type": "urn:entity:artist", take: 25 });
      if (!r.ok) return fail(r.error);
      // Artists carry no rating or themes, so only the caregiver's list applies.
      const { kept, excluded } = screen(r.entities, ctx.avoid, { content: false });
      const top = kept.slice(0, 8);
      for (const e of top) ctx.seen.set(e.entity_id, { kind: "artist", name: e.name });
      record(`${r.entities.length} artists returned, ${top.length} offered`, excluded, top.length ? "ok" : "gap");
      return { content: JSON.stringify({ artists: top.map((e) => ({ id: ctx.handle(e.entity_id, "a"), name: e.name })) }), isError: false };
    }

    case "get_screen": {
      const kind = args.kind === "tv" ? "tv" : "movie";
      const r = await ctx.qloo("/v2/insights", {
        ...signal,
        "filter.type": kind === "tv" ? "urn:entity:tv_show" : "urn:entity:movie",
        "filter.release_year.min": ctx.era.start,
        "filter.release_year.max": ctx.era.end,
        take: 25,
      });
      if (!r.ok) return fail(r.error);
      const { kept, excluded } = screen(r.entities, ctx.avoid, { content: true });
      const top = kept.slice(0, 6);
      for (const e of top) ctx.seen.set(e.entity_id, { kind, name: e.name, year: e.properties.release_year });
      record(`${r.entities.length} returned for ${ctx.era.start}–${ctx.era.end}, ${excluded.length} excluded, ${top.length} offered`, excluded, top.length ? "ok" : "gap");
      // Theme summaries help Claude catch loose matches with the avoid list. With nothing to avoid,
      // the name and year are enough (the content filter has already run), and leaving them out
      // makes the first message about a quarter shorter (tests/token-budget.test.ts).
      const about = !nothingToAvoid(ctx.avoid);
      return {
        content: JSON.stringify({
          titles: top.map((e) => ({
            id: ctx.handle(e.entity_id, kind === "tv" ? "t" : "m"),
            name: e.name,
            year: e.properties.release_year,
            ...(about ? { about: short(e.properties.plot_themes_description) } : {}),
          })),
        }),
        isError: false,
      };
    }

    case "get_places": {
      const r = await ctx.qloo("/v2/insights", { ...signal, "filter.type": "urn:entity:place", "filter.location.query": ctx.profile.hometown, take: 50 });
      if (!r.ok) return fail(r.error);
      const { kept, excluded } = screen(r.entities, ctx.avoid, { content: false });
      const top = landmarks(kept).slice(0, 6);
      for (const e of top) ctx.seen.set(e.entity_id, { kind: "place", name: e.name, genre: e.properties.primary_genre });
      record(`${r.entities.length} places returned, ${top.length} landmarks offered`, excluded, top.length ? "ok" : "gap");
      return {
        content: JSON.stringify({
          places: top.map((e) => ({
            id: ctx.handle(e.entity_id, "p"),
            name: e.name,
            kind: genreName(e),
            about: short(e.properties.short_description ?? e.properties.description),
          })),
        }),
        isError: false,
      };
    }

    case "get_dish": {
      const r = await ctx.qloo("/v2/insights", {
        ...signal,
        "filter.type": "urn:entity:place",
        "filter.location.query": ctx.profile.hometown,
        "filter.tags": "urn:tag:genre:place:restaurant",
        take: 50,
      });
      if (!r.ok) return fail(r.error);
      const { kept, excluded } = screen(r.entities, ctx.avoid, { content: false });
      const withDishes = kept
        .map((e) => ({ e, dishes: cleanDishes(e).slice(0, 3) }))
        .filter((x) => x.dishes.length)
        .slice(0, 6);
      // The same dish tag can be a specialty at several restaurants (bbq_beans in Memphis), so
      // remember every restaurant that listed it; the kit credits the one Claude chose.
      for (const { e, dishes } of withDishes) {
        for (const d of dishes) {
          ctx.seen.set(d.id, { kind: "dish", name: d.slug });
          const places = ctx.dishPlaces.get(d.id) ?? new Map<string, string>();
          places.set(e.entity_id, e.name);
          ctx.dishPlaces.set(d.id, places);
        }
      }
      record(`${r.entities.length} restaurants returned, ${withDishes.length} with dishes offered`, excluded, withDishes.length ? "ok" : "gap");
      return {
        content: JSON.stringify({
          restaurants: withDishes.map(({ e, dishes }) => ({
            place_id: ctx.handle(e.entity_id, "r"),
            place: e.name,
            about: short(e.properties.short_description ?? e.properties.description, 80),
            dishes: dishes.map((d) => ({ tag_id: ctx.handle(d.id, "d"), dish: d.slug.replace(/_/g, " ") })),
          })),
        }),
        isError: false,
      };
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

export type TraditionMusic = { artist: { id: string; name: string }; artists: { id: string; name: string }[] };

/**
 * Music for the caregiver's traditions, from an artist Claude named for them (Qloo's search
 * matches names, so "Catholic hymns" alone finds bands called "Hymns"). The artist is found in
 * Qloo, checked against the avoid list, and seeds an artist lookup. The artist itself can be
 * picked as music too: it's a Qloo result from this run. Null when nothing usable came back.
 */
export async function lookUpTradition(ctx: RunContext, artistName: string): Promise<TraditionMusic | null> {
  const found = JSON.parse((await runTool(ctx, "resolve_favorite", { name: artistName, kind: "artist" })).content);
  const top = (found.candidates as { id: string; name: string }[] | undefined)?.[0];
  if (!top) return null;
  const entity: QlooEntity = { entity_id: ctx.idFor(top.id), name: top.name, properties: {}, genres: [], keywords: [] };
  const { excluded } = screen([entity], ctx.avoid, { content: false });
  if (excluded.length) {
    ctx.trace.push({ id: ctx.nextId(), kind: "filter", label: "traditions artist", input: {}, outputSummary: "Left out: on the avoid list.", excluded, ms: 0, status: "gap" });
    return null;
  }
  ctx.seen.set(entity.entity_id, { kind: "artist", name: top.name });
  const music = JSON.parse((await runTool(ctx, "get_music", { seed_ids: [top.id] })).content);
  return { artist: { id: top.id, name: top.name }, artists: music.artists ?? [] };
}

function genreName(e: QlooEntity) {
  return e.properties.primary_genre?.split(":").pop()?.replace(/_/g, " ");
}
