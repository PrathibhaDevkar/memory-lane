import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildKit } from "@/lib/agent/kit";
import { validatePrompts } from "@/lib/agent/validate-prompts";
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
const { buildLiveKit } = await import("@/lib/agent/run");

const rosa = {
  displayName: "Rosa",
  birthYear: 1942,
  hometown: "Chicago",
  favorites: [{ text: "Frank Sinatra", kind: "artist" as const }],
  thingsToAvoid: ["none"],
};
const era = { start: 1952, end: 1972 };
const empty = { music: [], screen: [], dish: [], place: [], prompts: [], gaps: [] };

function ctxWithSeen() {
  const ctx = new RunContext(rosa, era);
  ctx.seen.set("ELLA", { kind: "artist", name: "Ella Fitzgerald" });
  ctx.seen.set("FILM", { kind: "movie", name: "Designing Woman", year: 1957 });
  ctx.seen.set("urn:tag:specialty_dish:place:chicago_style_pizza", { kind: "dish", name: "chicago_style_pizza", place: "Giordano's" });
  ctx.seen.set("MARKET", { kind: "place", name: "Maxwell Street Market", genre: "urn:tag:genre:place:market" });
  return ctx;
}

describe("buildKit (grounding)", () => {
  it("keeps picks a tool returned, using Qloo's names and years, not Claude's", () => {
    const kit = buildKit(ctxWithSeen(), {
      ...empty,
      music: [{ id: "ELLA", why: "Sinatra fans love her." }],
      screen: [{ id: "FILM", why: "A 1950s favorite." }],
      dish: [{ tag_id: "urn:tag:specialty_dish:place:chicago_style_pizza", name: "Chicago style pizza", why: "A Chicago classic." }],
      place: [{ id: "MARKET", why: "A long-running market." }],
      prompts: ["What music did people dance to back then?"],
    });
    expect(KitSchema.safeParse(kit).success).toBe(true);
    expect(kit.music.items[0]).toMatchObject({ title: "Ella Fitzgerald", qlooId: "ELLA", source: "qloo" });
    expect(kit.screen.items[0]).toMatchObject({ title: "Designing Woman", year: 1957 });
    expect(kit.dish.items[0]).toMatchObject({ name: "Chicago style pizza", fromPlace: "Giordano's" });
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
      dish: [{ tag_id: "urn:tag:specialty_dish:place:chicago_style_pizza", name: "Famous deep-dish pizza", why: "x" }],
    });
    expect(kit.dish.items[0].name).toBe("Chicago style pizza");
  });

  it("shows Claude's gap reason, or a failure reason, instead of inventing content (D6)", () => {
    const withGap = buildKit(ctxWithSeen(), { ...empty, gaps: [{ section: "dish", reason: "No hometown restaurant lists a dish." }] });
    expect(withGap.dish).toEqual({ status: "gap", items: [], gapReason: "No hometown restaurant lists a dish." });
    const failed = buildKit(ctxWithSeen(), null, "Claude declined this request.");
    expect(failed.music.gapReason).toBe("Claude declined this request.");
    expect(KitSchema.safeParse(failed).success).toBe(true);
  });
});

describe("validatePrompts", () => {
  it("keeps open questions and drops statements about the person's past", () => {
    const { kept, dropped, open } = validatePrompts([
      "What music did people dance to when you were young?",
      "Do you remember the first record you bought?",
      "You loved Sinatra, didn't you?",
      "Remember when you went to the market?",
      "Tell me about a street you liked to walk down.",
      "Sinatra was popular.",
    ]);
    expect(kept).toEqual([
      "What music did people dance to when you were young?",
      "Do you remember the first record you bought?",
      "Tell me about a street you liked to walk down.",
    ]);
    expect(dropped).toHaveLength(3);
    expect(open).toBe(2);
  });
});

describe("buildLiveKit (loop control, fake Claude)", () => {
  const msg = (content: unknown[], stop_reason = "tool_use") =>
    ({ id: "m", model: "claude-opus-5-5", role: "assistant", content, stop_reason, usage: {} }) as unknown as Anthropic.Beta.BetaMessage;
  const fakeClient = (responses: Anthropic.Beta.BetaMessage[]) => {
    const create = vi.fn(async () => responses.shift()!);
    return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
  };

  it("runs this turn's tools in parallel, returns all results in one message, then builds the kit", async () => {
    const { client, create } = fakeClient([
      msg([{ type: "tool_use", id: "a", name: "resolve_favorite", input: { name: "Frank Sinatra", kind: "artist" } }]),
      msg([
        { type: "tool_use", id: "b", name: "get_music", input: { seed_ids: ["SINATRA"] } },
        { type: "tool_use", id: "c", name: "get_places", input: { seed_ids: ["SINATRA"] } },
      ]),
      msg([{ type: "tool_use", id: "d", name: "submit_kit", input: { ...empty, music: [{ id: "SINATRA", why: "x" }] } }]),
    ]);
    const kit = await buildLiveKit(rosa, { client });
    expect(create).toHaveBeenCalledTimes(3);
    const third = create.mock.calls[2] as unknown as [{ messages: Anthropic.Beta.BetaMessageParam[] }];
    const lastUser = third[0].messages.at(-1)!;
    expect(Array.isArray(lastUser.content) && lastUser.content.map((c) => (c as { tool_use_id: string }).tool_use_id)).toEqual(["b", "c"]);
    expect(KitSchema.safeParse(kit).success).toBe(true);
    // "SINATRA" was returned as a favorite and as an artist (by get_music), so it's grounded.
    expect(kit.music.items[0]?.title).toBe("Frank Sinatra");
  });

  it("offers only submit_kit on the last turn, and still ends if Claude never submits", async () => {
    const { client, create } = fakeClient(Array.from({ length: 6 }, () => msg([{ type: "text", text: "thinking out loud" }], "end_turn")));
    const kit = await buildLiveKit(rosa, { client });
    expect(create).toHaveBeenCalledTimes(6);
    const last = create.mock.calls[5] as unknown as [{ tools: { name: string }[] }];
    expect(last[0].tools.map((t) => t.name)).toEqual(["submit_kit"]);
    expect(kit.music).toMatchObject({ status: "gap", gapReason: "The agent didn't finish within its limits." });
  });

  it("turns a refusal into an honest gap", async () => {
    const { client } = fakeClient([msg([], "refusal")]);
    const kit = await buildLiveKit(rosa, { client });
    expect(kit.place.gapReason).toMatch(/declined/);
  });
});
