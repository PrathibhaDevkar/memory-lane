import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/agent/prompts";
import { AI_ALONE_SYSTEM, buildComparison, ComparisonRefusedError, matchByName, sameName, type AiAlone } from "@/lib/compare";
import { clearQlooCache } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { ComparisonSchema, type Profile } from "@/lib/types";

// Claude on its own, checked against Qloo, with stand-ins for Claude and Qloo.

const rosa: Profile = {
  suddenChange: false,
  displayName: "Rosa",
  supportLevel: "early",
  birthYear: 1942,
  hometown: "Chicago",
  favorites: [{ text: "Frank Sinatra", kind: "artist" }],
  thingsToAvoid: ["Hospitals", "deep-dish pizza"],
};

const alone: AiAlone = {
  music: [
    { artist: "Nat 'King' Cole", why: "Smooth crooner loved by Sinatra fans." },
    { artist: "The Crooners Club Band", why: "Big-band sound of the era." },
  ],
  screen: [
    { title: "The Longest Day", kind: "film", year: 1962, why: "A big film of their twenties." },
    { title: "Field of Dreams", kind: "film", year: 1987, why: "Nostalgic and gentle." },
    { title: "Designing Woman", kind: "film", year: 1957, why: "Past a kit's limit of 2, so never checked." },
  ],
  place: [{ name: "Wrigley Field", why: "A Chicago landmark." }],
  dish: [{ name: "Deep-dish pizza", why: "Chicago's own dish." }],
  questions: [
    "Rosa, what music filled your home on a Saturday night?",
    "Do you remember the first record you bought?",
    "You loved dancing, didn't you?",
    "What did a perfect summer evening in Chicago look like?",
    "Which singer could always lift your mood?",
    "Tell me about a dance hall you liked.",
    "How did you like to spend a Sunday afternoon?",
  ],
};

// Qloo /search results by query, in Qloo's raw shape (the client slims them).
const raw = (name: string, extra: { year?: number; rating?: string; genres?: string[] } = {}) => ({
  entity_id: `id-${name}`,
  name,
  type: "urn:entity",
  properties: { ...(extra.year ? { release_year: extra.year } : {}), ...(extra.rating ? { content_rating: extra.rating } : {}) },
  tags: (extra.genres ?? []).map((g) => ({ name: g, type: "urn:tag:genre:media" })),
});
const SEARCH: Record<string, unknown[]> = {
  "Nat 'King' Cole": [raw("Nat King Cole")],
  "The Crooners Club Band": [raw("Crooners Club")], // a different name: not counted as found
  "Designing Woman": [raw("Designing Woman", { year: 1957 })],
  "The Longest Day": [raw("The Longest Day", { year: 1962, genres: ["War", "Drama"] })],
  "Field of Dreams": [raw("Field of Dreams", { year: 1989 })],
  "Wrigley Field": [raw("Wrigley Field")],
};

let queries: string[] = [];
const qloo = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(String(input));
  const query = url.searchParams.get("query") ?? "";
  queries.push(query);
  return new Response(JSON.stringify({ results: SEARCH[query] ?? [] }), { status: 200, headers: { "content-type": "application/json" } });
}) as unknown as typeof fetch;

const usage = { input_tokens: 900, output_tokens: 1200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const claude = (reply: Partial<{ parsed_output: AiAlone | null; stop_reason: string }> = {}) => {
  const parse = vi.fn(async () => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", usage, content: [], parsed_output: alone, ...reply }));
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
};

beforeEach(() => {
  vi.stubEnv("QLOO_API_KEY", "test-key");
  clearQlooCache();
  queries = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("the same care rules", () => {
  it("gives Claude on its own the agent's question rules word for word", () => {
    // A fair comparison: if the agent's rules change, the comparison's must too.
    const rules = SYSTEM_PROMPT.split("Every question or comment:\n")[1].split("\n\n")[0].split("\n");
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const rule of rules) expect(AI_ALONE_SYSTEM).toContain(rule);
  });
});

describe("matching Claude's names to Qloo", () => {
  it("ignores case, accents, punctuation and a leading The", () => {
    expect(sameName("Nat 'King' Cole", "Nat King Cole")).toBe(true);
    expect(sameName("Édith Piaf", "edith piaf")).toBe(true);
    expect(sameName("The Platters", "Platters")).toBe(true);
    expect(sameName("Crooners Club", "The Crooners Club Band")).toBe(false);
  });

  it("prefers the one from Claude's year when several share the name", () => {
    const e = (year: number): QlooEntity => ({ entity_id: String(year), name: "Sabrina", properties: { release_year: year }, genres: [], keywords: [] });
    expect(matchByName([e(1995), e(1954)], "Sabrina", 1954)?.entity_id).toBe("1954");
    expect(matchByName([e(1995), e(1954)], "Sabrina")?.entity_id).toBe("1995");
    expect(matchByName([e(1995)], "Sabrina", 1954)?.entity_id).toBe("1995");
    expect(matchByName([e(1995)], "Casablanca")).toBeUndefined();
  });
});

describe("buildComparison", () => {
  it("checks each pick against Qloo with the kit's own filters", async () => {
    const { client, parse } = claude();
    const { comparison, usage: used } = await buildComparison(rosa, { client, fetchImpl: qloo });
    expect(() => ComparisonSchema.parse(comparison)).not.toThrow();
    expect(comparison.era).toEqual({ start: 1952, end: 1972 });
    const pick = (title: string) => comparison.picks.find((p) => p.title === title);

    expect(pick("Nat 'King' Cole")).toMatchObject({ section: "music", inQloo: "yes", qlooName: "Nat King Cole", inEra: "unknown" });
    expect(pick("The Crooners Club Band")).toMatchObject({ inQloo: "no", inEra: "unknown" });
    expect(pick("The Longest Day")).toMatchObject({ section: "screen", year: 1962, inQloo: "yes", qlooYear: 1962, inEra: "yes", screenedOut: "War film or series." });
    expect(pick("Field of Dreams")).toMatchObject({ year: 1987, qlooYear: 1989, inEra: "no" });
    expect(pick("Wrigley Field")).toMatchObject({ section: "place", inQloo: "yes" });
    // Dishes aren't Qloo entities: not looked up, only checked against the avoid list.
    expect(pick("Deep-dish pizza")).toMatchObject({ section: "dish", inQloo: "unknown", inEra: "unknown" });
    expect(pick("Deep-dish pizza")?.screenedOut).toMatch(/avoid list/);
    expect(queries).not.toContain("Deep-dish pizza");
    // A kit shows at most 2 films; the rest isn't checked.
    expect(pick("Designing Woman")).toBeUndefined();
    expect(queries).not.toContain("Designing Woman");

    // Same model and effort as the agent, asked for a structured answer.
    const [request] = parse.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(request).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
    expect(request).not.toHaveProperty("tools");
    expect(JSON.stringify(request.messages)).toContain("1952–1972");
    expect(used).toMatchObject({ model: "claude-haiku-5-5", effort: "low", tokens: { in: 900, out: 1200 } });
    expect(used.costUsd).toBeGreaterThan(0);
  });

  it("checks the questions with the question rules, including the level's count", async () => {
    const { comparison } = await buildComparison(rosa, { client: claude().client, fetchImpl: qloo });
    const q = comparison.questions;
    expect(q).toHaveLength(6); // one past the early level's 5, so the count rule can show
    expect(q[0]).toEqual({ text: alone.questions[0], keeps: true });
    expect(q[1]).toMatchObject({ keeps: false, reason: "Asks them to remember, which can feel like a test." });
    expect(q[2]).toMatchObject({ keeps: false, reason: "States something about the person's past instead of asking." });
    expect(q.filter((x) => x.keeps)).toHaveLength(4);
  });

  it("traces the Claude call, each Qloo check and the question rules", async () => {
    const { comparison } = await buildComparison(rosa, { client: claude().client, fetchImpl: qloo });
    const kinds = comparison.trace.map((s) => s.kind);
    expect(kinds[0]).toBe("llm");
    expect(kinds.at(-1)).toBe("validator");
    // One Qloo lookup per pick except the dish, which only meets the avoid list.
    expect(comparison.trace.filter((s) => s.kind === "tool")).toHaveLength(comparison.picks.length - 1);
    expect(comparison.trace.find((s) => s.label === "Avoid list: Deep-dish pizza")).toMatchObject({ kind: "filter", excluded: [{ title: "Deep-dish pizza" }] });
    expect(comparison.trace.find((s) => s.label === "Qloo check: The Longest Day")?.excluded).toEqual([{ title: "The Longest Day", reason: "War film or series." }].map((e) => ({ ...e, title: "The Longest Day (1962)" })));
    expect(comparison.trace.at(-1)?.outputSummary).toBe("4 of 6 would be kept");
  });

  it("says unknown, not no, when Qloo can't be reached", async () => {
    const down = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const { comparison } = await buildComparison(rosa, { client: claude().client, fetchImpl: down, budgetMs: 1500 });
    for (const p of comparison.picks) expect(p.inQloo).toBe("unknown");
  });

  it("stops when Claude declines or answers in another shape", async () => {
    await expect(buildComparison(rosa, { client: claude({ stop_reason: "refusal", parsed_output: null }).client, fetchImpl: qloo })).rejects.toBeInstanceOf(ComparisonRefusedError);
    await expect(buildComparison(rosa, { client: claude({ parsed_output: null }).client, fetchImpl: qloo })).rejects.toBeInstanceOf(ComparisonRefusedError);
  });
});
