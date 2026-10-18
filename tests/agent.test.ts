import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildKit, checkIdeas } from "@/lib/agent/kit";
import { KitSchema } from "@/lib/types";

vi.mock("@/lib/qloo/client", () => ({
  qlooGet: vi.fn(async (path: string) => ({
    ok: true,
    status: 200,
    url: path,
    ms: 1,
    cached: false,
    entities: [{ entity_id: "SINATRA", name: "Frank Sinatra", properties: {}, genres: [], keywords: [] }],
  })),
}));

const { RunContext } = await import("@/lib/qloo/tools");
const { buildLiveKit, FINISH_NOW } = await import("@/lib/agent/run");
const { qlooGet } = await import("@/lib/qloo/client");

const rosa = {
  suddenChange: false,
  supportLevel: "early" as const,
  displayName: "Rosa",
  birthYear: 1942,
  hometown: "Chicago",
  favorites: [{ text: "Frank Sinatra", kind: "artist" as const }],
  thingsToAvoid: ["none"],
};
const era = { start: 1952, end: 1972 };
const empty = { music: [], screen: [], dish: [], place: [], prompts: [], activity_ideas: [], gaps: [] };

function ctxWithSeen() {
  const ctx = new RunContext(rosa, era);
  ctx.seen.set("ELLA", { kind: "artist", name: "Ella Fitzgerald" });
  ctx.seen.set("FILM", { kind: "movie", name: "Designing Woman", year: 1957 });
  ctx.seen.set("urn:tag:specialty_dish:place:chicago_style_pizza", { kind: "dish", name: "chicago_style_pizza" });
  ctx.dishPlaces.set("urn:tag:specialty_dish:place:chicago_style_pizza", new Map([["GINOS", "Gino's East"], ["GIORDANOS", "Giordano's"]]));
  ctx.seen.set("MARKET", { kind: "place", name: "Maxwell Street Market", genre: "urn:tag:genre:place:market" });
  return ctx;
}

describe("buildKit (grounding)", () => {
  it("keeps picks a tool returned, using Qloo's names and years, not Claude's", () => {
    const kit = buildKit(ctxWithSeen(), {
      ...empty,
      music: [{ id: "ELLA", why: "Sinatra fans love her." }],
      screen: [{ id: "FILM", why: "A 1950s favorite." }],
      dish: [{ tag_id: "urn:tag:specialty_dish:place:chicago_style_pizza", place_id: "GINOS", name: "Chicago style pizza", why: "A Chicago classic." }],
      place: [{ id: "MARKET", why: "A long-running market." }],
      prompts: ["What music did people dance to back then?"],
    });
    expect(KitSchema.safeParse(kit).success).toBe(true);
    expect(kit.music.items[0]).toMatchObject({ title: "Ella Fitzgerald", qlooId: "ELLA", source: "qloo" });
    expect(kit.screen.items[0]).toMatchObject({ title: "Designing Woman", year: 1957 });
    // Two restaurants list this dish; the kit credits the one Claude chose.
    expect(kit.dish.items[0]).toMatchObject({ name: "Chicago style pizza", fromPlace: "Gino's East" });
    expect(kit.provenance.kind).toBe("live");
  });

  it("removes picks no tool returned, and says so in the trace", () => {
    const kit = buildKit(ctxWithSeen(), { ...empty, music: [{ id: "INVENTED", why: "x" }, { id: "ELLA", why: "y" }] });
    expect(kit.music.items.map((i) => i.title)).toEqual(["Ella Fitzgerald"]);
    expect(kit.trace.at(-1)!.excluded[0].title).toContain("INVENTED");
  });

  it("rejects an ID of the wrong kind (a film offered as music)", () => {
    const kit = buildKit(ctxWithSeen(), { ...empty, music: [{ id: "FILM", why: "x" }] });
    expect(kit.music.status).toBe("gap");
  });

  it("falls back to Qloo's dish name if Claude adds words that aren't in it", () => {
    const kit = buildKit(ctxWithSeen(), {
      ...empty,
      dish: [{ tag_id: "urn:tag:specialty_dish:place:chicago_style_pizza", place_id: "GINOS", name: "Famous deep-dish pizza", why: "x" }],
    });
    expect(kit.dish.items[0].name).toBe("Chicago style pizza");
  });

  it("names no restaurant if the one Claude gives didn't list the dish", () => {
    const kit = buildKit(ctxWithSeen(), {
      ...empty,
      dish: [{ tag_id: "urn:tag:specialty_dish:place:chicago_style_pizza", place_id: "SOMEWHERE-ELSE", name: "Chicago style pizza", why: "x" }],
    });
    expect(kit.dish.items[0].fromPlace).toBeUndefined();
    expect(kit.trace.at(-1)!.excluded[0].reason).toMatch(/didn't list this dish/);
    expect(KitSchema.safeParse(kit).success).toBe(true);
  });

  it("shows Claude's gap reason, or a failure reason, instead of inventing content (D6)", () => {
    const withGap = buildKit(ctxWithSeen(), { ...empty, gaps: [{ section: "dish", reason: "No hometown restaurant lists a dish." }] });
    expect(withGap.dish).toEqual({ status: "gap", items: [], gapReason: "No hometown restaurant lists a dish." });
    const failed = buildKit(ctxWithSeen(), null, "Claude declined this request.");
    expect(failed.music.gapReason).toBe("Claude declined this request.");
    expect(KitSchema.safeParse(failed).success).toBe(true);
  });
});

describe("support levels and activity ideas", () => {
  const manyArtists = Array.from({ length: 6 }, (_, i) => ({ id: `A${i}`, why: "x" }));
  const ctxAt = (supportLevel: "early" | "middle" | "late") => {
    const ctx = new RunContext({ ...rosa, supportLevel }, era);
    for (let i = 0; i < 6; i++) ctx.seen.set(`A${i}`, { kind: "artist", name: `Artist ${i}` });
    return ctx;
  };

  it("limits songs per level: 5 early, 4 middle, 3 late", () => {
    expect(buildKit(ctxAt("early"), { ...empty, music: manyArtists }).music.items).toHaveLength(5);
    expect(buildKit(ctxAt("middle"), { ...empty, music: manyArtists }).music.items).toHaveLength(4);
    expect(buildKit(ctxAt("late"), { ...empty, music: manyArtists }).music.items).toHaveLength(3);
  });

  it("keeps safe ideas as labeled suggestions; drops food, small or sharp items, and anything at the early level", () => {
    const { kept, dropped } = checkIdeas(
      ["A soft wool scarf to hold", "Taste a little chocolate", "A jar of buttons to sort", "Scissors and old magazines", "Photos of 1950s Chicago"],
      "late",
    );
    expect(kept).toEqual([
      { text: "A soft wool scarf to hold", source: "llm" },
      { text: "Photos of 1950s Chicago", source: "llm" },
    ]);
    expect(dropped).toHaveLength(3);
    expect(checkIdeas(["A soft scarf"], "early").kept).toEqual([]);
  });

  it("puts ideas in the kit", () => {
    const kit = buildKit(ctxAt("middle"), { ...empty, activity_ideas: ["An old record sleeve to look at"] });
    expect(kit.activityIdeas).toEqual([{ text: "An old record sleeve to look at", source: "llm" }]);
    expect(KitSchema.safeParse(kit).success).toBe(true);
  });
});

describe("buildLiveKit (loop control, fake Claude)", () => {
  type Body = {
    tools: { name: string }[];
    messages: Anthropic.Beta.BetaMessageParam[];
    system: { type: string; text: string; cache_control?: unknown }[];
    cache_control?: unknown;
  };
  const msg = (content: unknown[], stop_reason = "tool_use", usage: object = {}) =>
    ({ id: "m", model: "claude-opus-5-5", role: "assistant", content, stop_reason, usage }) as unknown as Anthropic.Beta.BetaMessage;
  // Each call's token use goes to the server log; keep test output quiet.
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  beforeEach(() => {
    log.mockClear();
    vi.mocked(qlooGet).mockClear();
  });
  const fakeClient = (responses: Anthropic.Beta.BetaMessage[]) => {
    // Copies of each request as sent: the loop keeps appending to the same messages array.
    const sent: { body: Body; options: { signal?: AbortSignal } }[] = [];
    const create = vi.fn(async (body: Body, options: { signal?: AbortSignal }) => {
      sent.push({ body: structuredClone(body), options });
      return responses.shift()!;
    });
    return { client: { beta: { messages: { create } } } as unknown as Anthropic, create, sent };
  };

  it("looks up favorites before the first call, so the usual kit takes two Claude calls", async () => {
    const { client, create, sent } = fakeClient([
      msg([
        { type: "tool_use", id: "b", name: "get_music", input: { seed_ids: ["SINATRA"] } },
        { type: "tool_use", id: "c", name: "get_places", input: { seed_ids: ["SINATRA"] } },
      ]),
      msg([{ type: "tool_use", id: "d", name: "submit_kit", input: { ...empty, music: [{ id: "SINATRA", why: "x" }] } }]),
    ]);
    const kit = await buildLiveKit(rosa, { client });
    // The favorite was searched in code, and Claude's first message already carries its candidates.
    expect(vi.mocked(qlooGet).mock.calls[0][0]).toBe("/search");
    const first = JSON.stringify(sent[0].body.messages[0]);
    expect(first).toContain("favorites_resolved");
    expect(first).toContain("SINATRA");
    expect(kit.trace[0]).toMatchObject({ kind: "tool", label: "resolve_favorite" });
    // A turn's tools run in parallel and all their results go back in one message.
    expect(create).toHaveBeenCalledTimes(2);
    const lastUser = sent[1].body.messages.at(-1)!;
    expect(Array.isArray(lastUser.content) && lastUser.content.map((c) => (c as { tool_use_id: string }).tool_use_id)).toEqual(["b", "c"]);
    expect(KitSchema.safeParse(kit).success).toBe(true);
    // "SINATRA" was returned as a favorite and as an artist (by get_music), so it's grounded.
    expect(kit.music.items[0]?.title).toBe("Frank Sinatra");
  });

  it("sends the same tools every turn, asks Claude to finish on the last one, and still ends if Claude never submits", async () => {
    const { client, create, sent } = fakeClient(Array.from({ length: 6 }, () => msg([{ type: "text", text: "thinking out loud" }], "end_turn")));
    const kit = await buildLiveKit(rosa, { client });
    expect(create).toHaveBeenCalledTimes(6);
    // Changing the tool list mid-conversation would invalidate Claude's earlier thinking blocks.
    for (const { body } of sent) expect(body.tools.map((t) => t.name)).toEqual(sent[0].body.tools.map((t) => t.name));
    expect(sent[0].body.tools.map((t) => t.name)).toContain("submit_kit");
    // The finish request goes into the user turn being sent, not into history already sent.
    expect(JSON.stringify(sent[5].body.messages.at(-1))).toContain(FINISH_NOW);
    for (const { body } of sent.slice(0, 5)) expect(JSON.stringify(body.messages)).not.toContain(FINISH_NOW);
    expect(kit.music).toMatchObject({ status: "gap", gapReason: "The agent didn't finish within its limits." });
  });

  it("refuses lookups once it's the last turn: only the up-front favorite search reaches Qloo", async () => {
    const { client, sent } = fakeClient([
      msg([{ type: "tool_use", id: "a", name: "resolve_favorite", input: { name: "Frank Sinatra", kind: "artist" } }]),
      msg([{ type: "tool_use", id: "b", name: "submit_kit", input: empty }]),
    ]);
    // A budget this short makes the first turn the last one.
    const kit = await buildLiveKit(rosa, { client, budgetMs: 30_000 });
    expect(vi.mocked(qlooGet).mock.calls.map((c) => c[0])).toEqual(["/search"]);
    const results = sent[1].body.messages.at(-1)!.content as { tool_use_id: string; is_error: boolean; content: string }[];
    expect(results[0]).toMatchObject({ tool_use_id: "a", is_error: true });
    expect(results[0].content).toMatch(/Lookups are closed/);
    expect(KitSchema.safeParse(kit).success).toBe(true);
  });

  it("gives every Claude call a signal that stops it at the deadline, and turns a cut-off call into an honest gap", async () => {
    const create = vi.fn(async (_body: unknown, options: { signal?: AbortSignal }) => {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      throw new Anthropic.APIUserAbortError();
    });
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    const kit = await buildLiveKit(rosa, { client });
    expect(create).toHaveBeenCalledTimes(1);
    expect(kit.music).toMatchObject({ status: "gap", gapReason: "The agent ran out of time before finishing." });
    expect(KitSchema.safeParse(kit).success).toBe(true);
  });

  it("caches the tools and system prompt, and the history, the same way on every turn", async () => {
    const { client, sent } = fakeClient([
      msg([{ type: "tool_use", id: "b", name: "get_music", input: { seed_ids: ["SINATRA"] } }]),
      msg([{ type: "tool_use", id: "d", name: "submit_kit", input: empty }]),
    ]);
    await buildLiveKit(rosa, { client });
    for (const { body } of sent) {
      expect(body.system).toHaveLength(1);
      expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
      expect(body.cache_control).toEqual({ type: "ephemeral" });
      expect(body.system).toEqual(sent[0].body.system);
    }
  });

  it("records each call's token use in the trace and logs it without profile details", async () => {
    const usage = { input_tokens: 3100, output_tokens: 900, cache_creation_input_tokens: 2950, cache_read_input_tokens: null };
    const { client } = fakeClient([msg([{ type: "tool_use", id: "d", name: "submit_kit", input: empty }], "tool_use", usage)]);
    const kit = await buildLiveKit(rosa, { client });
    const turn = kit.trace.find((s) => s.kind === "llm")!;
    expect(turn.input.usage).toEqual({ in: 3100, cacheWrite: 2950, cacheRead: 0, out: 900 });
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({ event: "claude_turn", turn: 1, in: 3100, out: 900 });
    for (const detail of ["Rosa", "Chicago", "Sinatra", "1942"]) expect(line).not.toContain(detail);
  });

  it("turns a refusal into an honest gap", async () => {
    const { client } = fakeClient([msg([], "refusal")]);
    const kit = await buildLiveKit(rosa, { client });
    expect(kit.place.gapReason).toMatch(/declined/);
  });
});
