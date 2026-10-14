// Live check of the Qloo tools against the real API, in the order the agent calls them.
// Skipped unless LIVE=1 and QLOO_API_KEY are set. Costs Qloo calls, no Claude calls.
//
//   set -a; source .env.local; set +a; LIVE=1 npx vitest run tests/live

import { describe, expect, it } from "vitest";
import { RunContext, runTool } from "@/lib/qloo/tools";

const live = process.env.LIVE === "1" && Boolean(process.env.QLOO_API_KEY);

describe.skipIf(!live)("Qloo tools, live", () => {
  it("June: resolve → (music, film, tv, places, dish) with two seeds", async () => {
    const ctx = new RunContext(
      { displayName: "June", birthYear: 1958, hometown: "Los Angeles", favorites: [{ text: "The Sound of Music", kind: "movie" }], thingsToAvoid: ["hospitals"] },
      { start: 1968, end: 1988 },
    );
    const a = JSON.parse((await runTool(ctx, "resolve_favorite", { name: "The Sound of Music", kind: "movie" })).content);
    const b = JSON.parse((await runTool(ctx, "resolve_favorite", { name: "Julie Andrews", kind: "artist" })).content);
    const seeds = [a.candidates[0].id, b.candidates[0].id]; // two seeds, comma-joined
    const [music, film, tv, places, dish] = await Promise.all([
      runTool(ctx, "get_music", { seed_ids: seeds }),
      runTool(ctx, "get_screen", { seed_ids: seeds, kind: "movie" }),
      runTool(ctx, "get_screen", { seed_ids: seeds, kind: "tv" }),
      runTool(ctx, "get_places", { seed_ids: seeds }),
      runTool(ctx, "get_dish", { seed_ids: seeds }),
    ]);
    for (const out of [music, film, tv, places, dish]) expect(out.isError, out.content).toBe(false);
    for (const s of ctx.trace) console.log(`${s.label}: ${s.outputSummary} (${s.ms}ms)${s.excluded.length ? ` · excluded: ${s.excluded.map((e) => e.title).join(", ")}` : ""}`);
    console.log("music:", JSON.parse(music.content).artists.map((x: { name: string }) => x.name).join(", "));
    console.log("film:", JSON.parse(film.content).titles.map((x: { name: string; year: number }) => `${x.name} (${x.year})`).join(", "));
    console.log("dish:", JSON.parse(dish.content).restaurants.slice(0, 4).map((r: { place: string; dishes: { dish: string }[] }) => `${r.place}: ${r.dishes.map((d) => d.dish).join("/")}`).join("; "));
    expect(ctx.qlooCalls).toBe(7);
  }, 60_000);

  it("Taylor Swift hop: film seeded by Swift, then music seeded by that film", async () => {
    const ctx = new RunContext(
      { displayName: "Rosa", birthYear: 1942, hometown: "Chicago", favorites: [{ text: "Taylor Swift", kind: "artist" }], thingsToAvoid: ["none"] },
      { start: 1952, end: 1972 },
    );
    const swift = JSON.parse((await runTool(ctx, "resolve_favorite", { name: "Taylor Swift", kind: "artist" })).content).candidates[0].id;
    const film = JSON.parse((await runTool(ctx, "get_screen", { seed_ids: [swift], kind: "movie" })).content).titles[0];
    const music = JSON.parse((await runTool(ctx, "get_music", { seed_ids: [film.id] })).content).artists;
    console.log(`hop: Taylor Swift → ${film.name} (${film.year}) → ${music.map((x: { name: string }) => x.name).join(", ")}`);
    expect(film.year).toBeGreaterThanOrEqual(1952);
    expect(film.year).toBeLessThanOrEqual(1972);
  }, 60_000);
});
