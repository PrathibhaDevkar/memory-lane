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
      : params["filter.tags"] ? "june-restaurants"
      : type.endsWith("artist") ? "rosa-artists"
      : type.endsWith("movie") ? "june-movies"
      : type.endsWith("tv_show") ? "june-tv"
      : "june-places";
    return { ok: true, status: 200, url: path, ms: 1, cached: false, entities: fixture(file) };
  }),
}));

const { RunContext, runTool, MAX_QLOO_CALLS } = await import("@/lib/qloo/tools");

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

  it("resolve_favorite returns candidates and remembers their IDs", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    const out = parse(await runTool(ctx, "resolve_favorite", { name: "Frank Sinatra", kind: "artist" }));
    expect(out.candidates[0].name).toBe("Frank Sinatra");
    expect(ctx.seen.get(out.candidates[0].id)?.kind).toBe("favorite");
    expect(calls[0]).toMatchObject({ path: "/search", types: "urn:entity:artist" });
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

  it("get_places offers landmarks in the profile's hometown, historic first", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    ctx.seen.set("SEED", { kind: "favorite", name: "x" });
    const out = parse(await runTool(ctx, "get_places", { seed_ids: ["SEED"] }));
    expect(calls[0]).toMatchObject({ "filter.location.query": "Los Angeles", take: 50 });
    expect(out.places.slice(0, 2).map((p: { name: string }) => p.name).sort()).toEqual(["Hollywood Sign", "Spadena House"]);
  });

  it("get_dish offers only restaurants with cleaned dishes, and remembers dish tag IDs", async () => {
    const ctx = new RunContext(june, { start: 1968, end: 1988 });
    ctx.seen.set("SEED", { kind: "favorite", name: "x" });
    const out = parse(await runTool(ctx, "get_dish", { seed_ids: ["SEED"] }));
    expect(out.restaurants.length).toBeGreaterThan(0);
    const tagId = out.restaurants[0].dishes[0].tag_id;
    expect(ctx.seen.get(tagId)).toMatchObject({ kind: "dish", place: out.restaurants[0].place });
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
