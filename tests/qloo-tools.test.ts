import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QlooEntity } from "@/lib/qloo/types";

// Serve the committed Oct 14 fixtures instead of calling Qloo.
const fixture = (name: string): QlooEntity[] => JSON.parse(readFileSync(`fixtures/qloo/${name}.json`, "utf8")).entities;
const calls: Record<string, string | number | undefined>[] = [];
vi.mock("@/lib/qloo/client", () => ({
  qlooGet: vi.fn(async (path: string, params: Record<string, string | number | undefined>) => {
    calls.push({ path, ...params });
    const type = String(params["filter.type"] ?? "");
    const file =
      path === "/search" ? "rosa-search"
      : params["filter.tags"] ? (params["filter.location.query"] === "Memphis" ? "walt-restaurants" : "june-restaurants")
      : type.endsWith("artist") ? "rosa-artists"
      : type.endsWith("movie") ? "june-movies"
      : type.endsWith("tv_show") ? "june-tv"
      : "june-places";
    return { ok: true, status: 200, url: path, ms: 1, cached: false, entities: fixture(file) };
  }),
}));

const { RunContext, runTool, lookUpTradition, MAX_QLOO_CALLS } = await import("@/lib/qloo/tools");
const { buildKit } = await import("@/lib/agent/kit");

const june = {
  suddenChange: false,
  supportLevel: "early" as const,
  displayName: "June",
  birthYear: 1958,
  hometown: "Los Angeles",
  favorites: [{ text: "The Sound of Music", kind: "movie" as const }],
  thingsToAvoid: ["none"],
};
const parse = (o: { content: string }) => JSON.parse(o.content);

describe("Qloo tools", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("resolve_favorite returns candidates under short handles and remembers their Qloo IDs", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    const out = parse(await runTool(ctx, "resolve_favorite", { name: "Frank Sinatra", kind: "artist" }));
    expect(out.candidates[0]).toMatchObject({ id: "f1", name: "Frank Sinatra" });
    expect(ctx.idFor("f1")).toBe(fixture("rosa-search")[0].entity_id);
    expect(ctx.seen.get(ctx.idFor("f1"))?.kind).toBe("favorite");
    expect(calls[0]).toMatchObject({ path: "/search", types: "urn:entity:artist" });
  });

  it("shows Claude short handles, never Qloo's 36-character IDs, and accepts them back as seeds", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    await runTool(ctx, "resolve_favorite", { name: "The Sound of Music", kind: "movie" });
    const results = await Promise.all([
      runTool(ctx, "get_music", { seed_ids: ["f1"] }),
      runTool(ctx, "get_screen", { seed_ids: ["f1"], kind: "movie" }),
      runTool(ctx, "get_places", { seed_ids: ["f1"] }),
      runTool(ctx, "get_dish", { seed_ids: ["f1"] }),
    ]);
    for (const r of results) {
      expect(r.isError).toBe(false);
      expect(r.content).not.toMatch(/[0-9A-F]{8}-[0-9A-F]{4}-/);
      expect(r.content).not.toContain("urn:tag:");
    }
    // The seed reached Qloo as the real ID.
    expect(String(calls.at(-1)!["signal.interests.entities"])).toBe(ctx.idFor("f1"));
  });

  it("labels music seeded with a film a lookup found, so the trace and the progress panel can tell the two apart", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    await runTool(ctx, "resolve_favorite", { name: "The Sound of Music", kind: "movie" });
    const films = parse(await runTool(ctx, "get_screen", { seed_ids: ["f1"], kind: "movie" }));
    await runTool(ctx, "get_music", { seed_ids: ["f1"] }); // a favorite: fans of it
    await runTool(ctx, "get_music", { seed_ids: [films.titles[0].id] }); // a film from their years
    expect(ctx.trace.filter((s) => s.label.startsWith("get_music")).map((s) => s.label)).toEqual(["get_music", "get_music(from film)"]);
  });

  it("refuses seeds that no earlier tool returned", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    const out = await runTool(ctx, "get_music", { seed_ids: ["MADE-UP-ID"] });
    expect(out.isError).toBe(true);
    expect(calls).toHaveLength(0);
    expect(ctx.trace[0]).toMatchObject({ status: "gap" });
  });

  it("get_screen uses the profile's era window and drops unsafe titles before Claude sees them", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    ctx.seen.set("SEED", { kind: "favorite", name: "The Sound of Music" });
    // Claude can't widen the window: extra input is ignored.
    const out = parse(await runTool(ctx, "get_screen", { seed_ids: ["SEED"], kind: "movie", "filter.release_year.min": 2000 }));
    expect(calls[0]).toMatchObject({ "filter.release_year.min": 1968, "filter.release_year.max": 1988 });
    expect(calls[0]).not.toHaveProperty("signal.demographics.age");
    const names = out.titles.map((t: { name: string }) => t.name);
    expect(names).not.toContain("Terms of Endearment");
    expect(names).not.toContain("Flashdance");
    const step = ctx.trace.at(-1)!;
    expect(step.excluded.map((e) => e.title)).toContain("Terms of Endearment (1983)");
  });

  it("applies the caregiver's avoid list", async () => {
    const ctx = new RunContext({ ...june, thingsToAvoid: ["Annie"] }, { start: 1968, end: 1988 });
    ctx.seen.set("SEED", { kind: "favorite", name: "x" });
    const out = parse(await runTool(ctx, "get_screen", { seed_ids: ["SEED"], kind: "movie" }));
    expect(out.titles.map((t: { name: string }) => t.name)).not.toContain("Annie");
  });

  it("sends theme summaries only when there's something to avoid (they help catch loose matches)", async () => {
    const titles = async (thingsToAvoid: string[]) => {
      const ctx = new RunContext({ ...june, thingsToAvoid }, { start: 1968, end: 1988 });
      ctx.seen.set("SEED", { kind: "favorite", name: "x" });
      return parse(await runTool(ctx, "get_screen", { seed_ids: ["SEED"], kind: "movie" })).titles as { about?: string }[];
    };
    for (const nothing of [["none"], ["Nothing to avoid"], ["n/a"]]) expect((await titles(nothing)).every((t) => t.about === undefined)).toBe(true);
    expect((await titles(["hospitals"])).every((t) => typeof t.about === "string")).toBe(true);
  });

  it("resolve_favorite never makes an artist a lookup offered unpickable", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    const sinatra = fixture("rosa-search")[0].entity_id;
    ctx.seen.set(sinatra, { kind: "artist", name: "Frank Sinatra" });
    await runTool(ctx, "resolve_favorite", { name: "Frank Sinatra", kind: "artist" });
    expect(ctx.seen.get(sinatra)?.kind).toBe("artist");
  });

  it("lookUpTradition finds the artist Claude named and music like it, and the artist can be picked", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    const found = (await lookUpTradition(ctx, "Frank Sinatra"))!;
    expect(found.artist).toEqual({ id: "f1", name: "Frank Sinatra" });
    expect(found.artists.map((a) => a.name)).toContain("Ella Fitzgerald");
    expect(calls.map((c) => c.path)).toEqual(["/search", "/v2/insights"]);
    const kit = buildKit(ctx, {
      music: [{ id: "f1", why: "x" }, { id: found.artists[0].id, why: "x" }],
      screen: [], dish: [], place: [], prompts: [], activity_ideas: [], gaps: [],
    });
    expect(kit.music.items.map((i) => i.title)).toEqual(["Frank Sinatra", found.artists[0].name]);
  });

  it("lookUpTradition leaves out an artist on the avoid list", async () => {
    const ctx = new RunContext({ ...june, thingsToAvoid: ["Frank Sinatra"] }, { start: 1968, end: 1988 });
    expect(await lookUpTradition(ctx, "Frank Sinatra")).toBeNull();
    expect(calls.map((c) => c.path)).toEqual(["/search"]);
    expect(ctx.trace.at(-1)).toMatchObject({ kind: "filter", status: "gap" });
  });

  it("get_places offers landmarks in the profile's hometown, historic first", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    ctx.seen.set("SEED", { kind: "favorite", name: "x" });
    const out = parse(await runTool(ctx, "get_places", { seed_ids: ["SEED"] }));
    expect(calls[0]).toMatchObject({ "filter.location.query": "Los Angeles", take: 50 });
    expect(out.places.slice(0, 2).map((p: { name: string }) => p.name).sort()).toEqual(["Hollywood Sign", "Spadena House"]);
  });

  it("get_dish offers only restaurants with cleaned dishes, and remembers which restaurant listed each dish", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    ctx.seen.set("SEED", { kind: "favorite", name: "x" });
    const out = parse(await runTool(ctx, "get_dish", { seed_ids: ["SEED"] }));
    expect(out.restaurants.length).toBeGreaterThan(0);
    const { place_id, place, dishes } = out.restaurants[0];
    expect(ctx.seen.get(ctx.idFor(dishes[0].tag_id))).toMatchObject({ kind: "dish" });
    expect(ctx.dishPlaces.get(ctx.idFor(dishes[0].tag_id))?.get(ctx.idFor(place_id))).toBe(place);
  });

  it("credits a dish to the restaurant Claude chose when several list it (Walt's bbq beans)", async () => {
    const walt = { ...june, displayName: "Walt", birthYear: 1950, hometown: "Memphis" };
    const ctx = new RunContext(walt, { start: 1960, end: 1980 });
    ctx.seen.set("SEED", { kind: "favorite", name: "x" });
    const out = parse(await runTool(ctx, "get_dish", { seed_ids: ["SEED"] }));
    const beans = "urn:tag:specialty_dish:place:bbq_beans";
    const listing = out.restaurants.filter((r: { dishes: { tag_id: string }[] }) => r.dishes.some((d) => ctx.idFor(d.tag_id) === beans));
    expect(listing.map((r: { place: string }) => r.place)).toEqual(["The Pig On Beale", "Imagine Vegan Cafe"]);
    const pig = listing[0].place_id;
    const kit = buildKit(ctx, {
      music: [], screen: [], place: [], prompts: [], activity_ideas: [], gaps: [],
      dish: [{ tag_id: beans, place_id: pig, name: "bbq beans", why: "A Beale Street barbecue side." }],
    });
    expect(kit.dish.items[0]).toMatchObject({ name: "bbq beans", fromPlace: "The Pig On Beale" });
  });

  it(`stops at ${MAX_QLOO_CALLS} Qloo calls per kit`, async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    ctx.seen.set("SEED", { kind: "favorite", name: "x" });
    for (let i = 0; i < MAX_QLOO_CALLS; i++) await runTool(ctx, "get_music", { seed_ids: ["SEED"] });
    const out = await runTool(ctx, "get_music", { seed_ids: ["SEED"] });
    expect(out.isError).toBe(true);
    expect(calls).toHaveLength(MAX_QLOO_CALLS);
  });
});
