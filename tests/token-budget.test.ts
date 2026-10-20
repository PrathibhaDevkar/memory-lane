import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { QlooEntity } from "@/lib/qloo/types";
import type { Profile } from "@/lib/types";

// What Claude reads for one kit, measured offline: the saved Qloo responses go through the real
// lookups, and a stand-in for Claude records each request and submits at once. No network, no
// spend. The budgets below fail the suite if a change makes Claude read noticeably more; MEASURE=1
// prints the numbers. Live token counts come from `npm run smoke -- --report`.

type Files = { search: string; artist: string; movie: string; tv: string; place: string; restaurant: string; artistViaFilm?: string };
const ROSA: Files = { search: "rosa-search", artist: "rosa-artists", movie: "rosa-movies", tv: "rosa-tv", place: "rosa-places", restaurant: "rosa-restaurants" };
const FILES: Record<string, Files> = {
  rosa: ROSA,
  walt: { search: "walt-search", artist: "walt-artists", movie: "walt-movies", tv: "walt-tv", place: "walt-places", restaurant: "walt-restaurants" },
  june: { search: "june-search", artist: "june-artists", movie: "june-movies", tv: "june-tv", place: "june-places", restaurant: "june-restaurants" },
  // A modern favorite: music seeded with Taylor Swift is modern; seeded with the top film from
  // Rosa's era (Mary Poppins) it isn't. TV, places and restaurants reuse Rosa's (Chicago).
  swift: { ...ROSA, search: "hop-search", artist: "hop-artists-direct", artistViaFilm: "hop-artists-via-film", movie: "hop-movies" },
  // Traditions, on Rosa's saved responses (sizes only: every search returns Frank Sinatra).
  elena: ROSA,
};
const MARY_POPPINS = "4D711F6C";

const load = (name: string): QlooEntity[] => JSON.parse(readFileSync(`fixtures/qloo/${name}.json`, "utf8")).entities;
let current: Files = ROSA;

vi.mock("@/lib/qloo/client", () => ({
  qlooGet: vi.fn(async (path: string, params: Record<string, string | number | undefined>) => {
    const type = String(params["filter.type"] ?? "");
    const seeds = String(params["signal.interests.entities"] ?? "");
    const f = current;
    const file =
      path === "/search" ? f.search
      : params["filter.tags"] ? f.restaurant
      : type.endsWith("artist") ? (f.artistViaFilm && seeds.startsWith(MARY_POPPINS) ? f.artistViaFilm : f.artist)
      : type.endsWith("movie") ? f.movie
      : type.endsWith("tv_show") ? f.tv
      : f.place;
    return { ok: true, status: 200, url: path, ms: 1, cached: false, entities: load(file) };
  }),
}));

const { buildLiveKit } = await import("@/lib/agent/run");

const base = { suddenChange: false, supportLevel: "early" as const, thingsToAvoid: ["none"] };
const PERSONAS: Record<string, Profile> = {
  rosa: { ...base, displayName: "Rosa", birthYear: 1942, hometown: "Chicago", favorites: [{ text: "Frank Sinatra", kind: "artist" }] },
  walt: { ...base, displayName: "Walt", birthYear: 1950, hometown: "Memphis", favorites: [{ text: "Elvis Presley", kind: "artist" }], thingsToAvoid: ["war films"] },
  june: { ...base, displayName: "June", birthYear: 1958, hometown: "Los Angeles", favorites: [{ text: "The Sound of Music", kind: "movie" }], thingsToAvoid: ["hospitals"] },
  swift: { ...base, displayName: "Rosa", birthYear: 1942, hometown: "Chicago", favorites: [{ text: "Taylor Swift", kind: "artist" }] },
  elena: { ...base, supportLevel: "late", displayName: "Elena", birthYear: 1938, hometown: "Chicago", favorites: [{ text: "Perry Como", kind: "artist" }], traditions: "Catholic hymns" },
};

type Body = Anthropic.Beta.MessageCreateParamsNonStreaming;
const reply = (content: unknown[]) =>
  ({ id: "m", model: "claude-haiku-5-5", role: "assistant", content, stop_reason: "end_turn", usage: {} }) as unknown as Anthropic.Beta.BetaMessage;
const empty = { music: [], screen: [], dish: [], place: [], prompts: [], activity_ideas: [], gaps: [] };

/** Builds one kit with a stand-in for Claude; returns what the main request carried. */
async function measure(who: string) {
  current = FILES[who];
  const sent: Body[] = [];
  const create = vi.fn(async (body: Body) => {
    sent.push(structuredClone(body));
    // The short traditions call has no tools and wants a name; the main call submits at once.
    return body.tools ? reply([{ type: "tool_use", id: "s", name: "submit_kit", input: empty }]) : reply([{ type: "text", text: "Bing Crosby" }]);
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  await buildLiveKit(PERSONAS[who], { client: { beta: { messages: { create } } } as unknown as Anthropic });
  const main = sent.find((b) => b.tools)!;
  const text = main.messages[0].content as string;
  return {
    system: (main.system as { text: string }[]).map((b) => b.text).join("").length,
    tools: JSON.stringify(main.tools).length,
    message: text.length,
    shortCall: sent.filter((b) => !b.tools).reduce((n, b) => n + JSON.stringify(b.messages).length, 0),
    longIds: (text.match(/[0-9A-F]{8}-[0-9A-F]{4}-/g) ?? []).length,
    text,
  };
}

describe("what Claude reads for one kit (offline, saved Qloo responses)", () => {
  it("stays within budget", async () => {
    const rows: Record<string, Awaited<ReturnType<typeof measure>>> = {};
    for (const who of Object.keys(FILES)) rows[who] = await measure(who);
    if (process.env.MEASURE) {
      const out = Object.fromEntries(Object.entries(rows).map(([who, { text, ...r }]) => [who, process.env.MEASURE === "show" ? { ...r, text } : r]));
      process.stdout.write(`\n${JSON.stringify(out, null, 1)}\n`);
    }
    // The cached prefix (system prompt + tools) and each person's first message, in characters.
    // Raise a budget only on purpose, with a smoke-check audit (CLAUDE.md, Engineering rule 2).
    // Oct 20: prefix 6,288; messages rosa 3,695, walt 5,452, june 5,490, swift 3,996, elena 3,799.
    expect(rows.rosa.system + rows.rosa.tools).toBeLessThanOrEqual(6_600);
    for (const [who, max] of Object.entries({ rosa: 3_900, walt: 5_750, june: 5_750, swift: 4_200, elena: 4_000 })) {
      expect(rows[who].message, who).toBeLessThanOrEqual(max);
      expect(rows[who].longIds, who).toBe(0);
    }
    // music_from_film for a modern favorite; tradition_music instead of extra calls for traditions.
    expect(rows.swift.text).toContain("music_from_film");
    expect(rows.elena.text).toContain("tradition_music");
    expect(rows.elena.text).not.toContain("to_do");
  });
});
