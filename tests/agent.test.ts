import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const { agentConfig, artistFromReply, buildLiveKit, DEFAULT_EFFORT, DEFAULT_MODEL, FINISH_NOW, traditionQuestion, traditionsToDo } = await import("@/lib/agent/run");
const { auditKit } = await import("@/lib/agent/audit");
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

describe("model rule: Haiku by default, Sonnet or Opus only with a recorded approval", () => {
  afterEach(() => vi.unstubAllEnvs());
  const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => {});

  it("uses Claude Haiku 5.5 when nothing is set", () => {
    vi.stubEnv("CLAUDE_MODEL", "");
    expect(DEFAULT_MODEL).toBe("claude-haiku-5-5");
    expect(agentConfig().model).toBe("claude-haiku-5-5");
  });

  it("thinks at low effort unless CLAUDE_EFFORT says otherwise", () => {
    vi.stubEnv("CLAUDE_EFFORT", "");
    expect(agentConfig().effort).toBe("low");
    vi.stubEnv("CLAUDE_EFFORT", "medium");
    expect(agentConfig().effort).toBe("medium");
  });

  it("reads CLAUDE_EFFORT whatever its spaces and capitals", () => {
    expect(DEFAULT_EFFORT).toBe("low");
    for (const [set, used] of [[" Medium ", "medium"], ["HIGH", "high"], ["max", "max"]]) {
      vi.stubEnv("CLAUDE_EFFORT", set);
      expect(agentConfig().effort).toBe(used);
    }
  });

  it("falls back to low, and says so in the log, when CLAUDE_EFFORT is mistyped, so kits don't fail", () => {
    const warn = quiet();
    for (const set of ["lwo", "minimal", "1", "medium effort"]) {
      vi.stubEnv("CLAUDE_EFFORT", set);
      expect(agentConfig().effort).toBe("low");
    }
    expect(warn).toHaveBeenCalledTimes(4);
    expect(String(warn.mock.calls[0][0])).toContain("effort_not_valid");
    warn.mockRestore();
  });

  it("falls back to Haiku, and says so in the log, when Sonnet or Opus is set without approval", () => {
    const warn = quiet();
    vi.stubEnv("CLAUDE_MODEL", "claude-opus-5-5");
    vi.stubEnv("CLAUDE_MODEL_APPROVAL", "");
    expect(agentConfig().model).toBe("claude-haiku-5-5");
    expect(String(warn.mock.calls[0][0])).toContain("model_not_approved");
    warn.mockRestore();
  });

  it("uses the requested model when the approval names it, and only that model", () => {
    const warn = quiet();
    vi.stubEnv("CLAUDE_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("CLAUDE_MODEL_APPROVAL", "claude-sonnet-5-5 approved 2026-10-21 by Abil and Prathibha, audits/2026-10-21-claude-sonnet-5-5-medium.md");
    expect(agentConfig().model).toBe("claude-sonnet-5-5");
    vi.stubEnv("CLAUDE_MODEL", "claude-opus-5-5");
    expect(agentConfig().model).toBe("claude-haiku-5-5");
    warn.mockRestore();
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

  it("sends the default effort, low, with the main call", async () => {
    vi.stubEnv("CLAUDE_EFFORT", "");
    const { client, sent } = fakeClient([msg([{ type: "tool_use", id: "d", name: "submit_kit", input: empty }])]);
    await buildLiveKit(rosa, { client });
    expect((sent[0].body as unknown as { output_config: unknown }).output_config).toEqual({ effort: "low" });
    vi.unstubAllEnvs();
  });

  it("runs the usual lookups in code, so the usual kit takes one Claude call", async () => {
    const { client, create, sent } = fakeClient([
      msg([{ type: "tool_use", id: "d", name: "submit_kit", input: { ...empty, music: [{ id: "f1", why: "x" }] } }]),
    ]);
    const kit = await buildLiveKit(rosa, { client });
    expect(create).toHaveBeenCalledTimes(1);
    // The favorite, then music, films, TV, places and dishes, all before Claude is called.
    const lookups = kit.trace.filter((s) => s.kind === "tool").map((s) => s.label);
    expect(lookups[0]).toBe("resolve_favorite");
    expect(lookups.slice(1).sort()).toEqual(["get_dish", "get_music", "get_places", "get_screen(movie)", "get_screen(tv)"]);
    expect(kit.trace.findIndex((s) => s.kind === "llm")).toBe(lookups.length);
    // Claude's one message carries the results under short handles, never Qloo's own IDs.
    const first = JSON.stringify(sent[0].body.messages[0]);
    expect(first).toContain("favorites_resolved");
    expect(first).toContain('\\"music_seeds\\":[\\"f1\\"]');
    expect(first).not.toContain("SINATRA");
    expect(KitSchema.safeParse(kit).success).toBe(true);
    // f1 was returned as a favorite and as an artist (by get_music), so it's grounded.
    expect(kit.music.items[0]).toMatchObject({ title: "Frank Sinatra", qlooId: "SINATRA" });
  });

  it("reports each step as it happens, and when Claude starts choosing, for the page to show", async () => {
    const { client } = fakeClient([msg([{ type: "tool_use", id: "d", name: "submit_kit", input: { ...empty, music: [{ id: "f1", why: "x" }] } }])]);
    const events: { type: string; phase?: string; step?: Record<string, unknown> }[] = [];
    const kit = await buildLiveKit(rosa, { client, onProgress: (e) => events.push(e) });
    // Lookups first, then Claude, then the kit's own check: the same steps as the trace, in order.
    expect(events[0]).toEqual({ type: "phase", phase: "lookups" });
    const choosing = events.findIndex((e) => e.phase === "choosing");
    expect(events.slice(1, choosing).every((e) => e.type === "step" && e.step?.kind === "tool")).toBe(true);
    const steps = events.filter((e) => e.type === "step").map((e) => e.step!);
    expect(steps.map((s) => s.id)).toEqual(kit.trace.map((s) => s.id));
    expect(steps.at(-2)).toMatchObject({ kind: "llm", label: "Claude, turn 1" });
    // The page gets what it shows, not the lookups' inputs (model, token counts, seed IDs).
    expect(steps.every((s) => !("input" in s))).toBe(true);
  });

  describe("music for the caregiver's traditions", () => {
    const submit = () => msg([{ type: "tool_use", id: "d", name: "submit_kit", input: empty }]);
    const reply = (text: string) => msg([{ type: "text", text }], "end_turn", { input_tokens: 70, output_tokens: 5 });
    const elena = { ...rosa, traditions: "Catholic hymns" };

    it("asks for an artist in one short call, then looks the music up in code, so the kit needs one main call", async () => {
      const { client, create, sent } = fakeClient([reply("Bing Crosby"), submit()]);
      const kit = await buildLiveKit(elena, { client });
      expect(create).toHaveBeenCalledTimes(2);
      // The short call: no tools, no system prompt, no thinking, and only the traditions and years.
      const ask = sent[0].body as unknown as Record<string, unknown> & Body;
      expect(ask.tools).toBeUndefined();
      expect(ask.system).toBeUndefined();
      expect(ask.thinking).toEqual({ type: "disabled" });
      expect(ask.output_config).toEqual({ effort: "low" });
      const question = JSON.stringify(ask.messages);
      expect(question).toContain("Catholic hymns");
      expect(question).toContain("1952–1972");
      expect(question).not.toContain("Rosa");
      // The main call gets the music and no to_do.
      const first = JSON.stringify(sent[1].body.messages[0]);
      expect(first).toContain("tradition_music");
      expect(first).not.toContain("to_do");
      const step = kit.trace.find((s) => s.label === "Claude, an artist for the traditions")!;
      expect(step).toMatchObject({ kind: "llm", outputSummary: "Named Bing Crosby" });
      expect(step.input.usage).toEqual({ in: 70, cacheWrite: 0, cacheRead: 0, out: 5 });
      expect(auditKit(kit).calls).toBe(2);
    });

    it("leaves traditions to the main call when Claude names no artist", async () => {
      const { client, sent } = fakeClient([reply("none"), submit()]);
      await buildLiveKit(elena, { client });
      const first = JSON.stringify(sent[1].body.messages[0]);
      expect(first).not.toContain("tradition_music");
      expect(first).not.toContain("to_do");
    });

    it("falls back to asking Claude in the loop when the short call fails", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sent: Body[] = [];
      const create = vi.fn(async (body: Body) => {
        sent.push(structuredClone(body));
        if (sent.length === 1) throw new Error("network down");
        return submit();
      });
      await buildLiveKit(elena, { client: { beta: { messages: { create } } } as unknown as Anthropic });
      expect(JSON.stringify(sent[1].messages[0])).toContain("to_do");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("traditions_call_failed"));
      warn.mockRestore();
    });

    it("makes no extra call and changes nothing without traditions", async () => {
      expect(traditionsToDo(undefined)).toBeUndefined();
      expect(traditionsToDo("  ")).toBeUndefined();
      expect(traditionsToDo("Catholic hymns")).toMatch(/"Catholic hymns".*resolve_favorite.*artist's name.*get_music/);
      const { client, create, sent } = fakeClient([submit()]);
      await buildLiveKit(rosa, { client });
      expect(create).toHaveBeenCalledTimes(1);
      const first = JSON.stringify(sent[0].body.messages[0]);
      expect(first).not.toContain("to_do");
      expect(first).not.toContain("tradition_music");
    });

    it("reads only a name from the reply", () => {
      expect(artistFromReply("Bing Crosby")).toBe("Bing Crosby");
      expect(artistFromReply(' "Mahalia Jackson." ')).toBe("Mahalia Jackson");
      expect(artistFromReply("Bing Crosby\nHe recorded many hymns.")).toBe("Bing Crosby");
      expect(artistFromReply("none")).toBeNull();
      expect(artistFromReply("None fits these traditions.")).toBeNull();
      expect(artistFromReply("")).toBeNull();
      expect(artistFromReply("I would suggest looking for a choir that sang in Latin")).toBeNull();
      expect(traditionQuestion(" Catholic hymns ", era)).toMatch(/1952–1972: "Catholic hymns"\. Name one/);
    });
  });

  it("adds music seeded with the top film when only artists seed music, so a modern favorite needs no extra call", async () => {
    const entity = (id: string, name: string, year?: number) => ({ entity_id: id, name, properties: { release_year: year }, genres: [], keywords: [] });
    const original = vi.mocked(qlooGet).getMockImplementation()!;
    vi.mocked(qlooGet).mockImplementation(async (path: string, params?: Record<string, string | number | undefined>) => {
      const type = String(params?.["filter.type"] ?? "");
      const seeds = String(params?.["signal.interests.entities"] ?? "");
      const entities =
        path === "/search" ? [params?.query === "Mary Poppins" ? entity("POPPINS", "Mary Poppins", 1964) : entity("SWIFT", "Taylor Swift")]
        : type.endsWith("movie") ? [entity("POPPINS", "Mary Poppins", 1964)]
        : type.endsWith("artist") ? (seeds === "POPPINS" ? [entity("JEPSEN", "Carly Rae Jepsen"), entity("SINATRA", "Frank Sinatra")] : [entity("JEPSEN", "Carly Rae Jepsen")])
        : [];
      return { ok: true, status: 200, url: path, ms: 1, cached: false, entities };
    });
    try {
      // Stands in for Claude: picks the era artist from music_from_film, with no extra lookup.
      type Artist = { id: string; name: string };
      let message: { lookups: { music: { artists: Artist[] }; music_from_film: Artist[] } } | undefined;
      const create = vi.fn(async (body: Body) => {
        message = JSON.parse((body.messages[0].content as string).split("\n\n")[1]);
        const pick = message!.lookups.music_from_film.find((a) => a.name === "Frank Sinatra")!;
        return msg([{ type: "tool_use", id: "d", name: "submit_kit", input: { ...empty, music: [{ id: pick.id, why: "x" }] } }]);
      });
      const client = { beta: { messages: { create } } } as unknown as Anthropic;
      const kit = await buildLiveKit({ ...rosa, favorites: [{ text: "Taylor Swift", kind: "artist" }] }, { client });
      expect(create).toHaveBeenCalledTimes(1);
      expect(message!.lookups.music.artists.map((a) => a.name)).toEqual(["Carly Rae Jepsen"]);
      // Only artists not already in music.
      expect(message!.lookups.music_from_film.map((a) => a.name)).toEqual(["Frank Sinatra"]);
      expect(kit.music.items[0]).toMatchObject({ title: "Frank Sinatra", qlooId: "SINATRA" });

      // A film favorite from the person's era already gives music its era: no second music list.
      vi.mocked(qlooGet).mockClear();
      const june = fakeClient([msg([{ type: "tool_use", id: "d", name: "submit_kit", input: empty }])]);
      await buildLiveKit({ ...rosa, favorites: [{ text: "Mary Poppins", kind: "movie" }] }, { client: june.client });
      expect(JSON.stringify(june.sent[0].body.messages[0])).not.toContain("music_from_film");
    } finally {
      vi.mocked(qlooGet).mockImplementation(original);
    }
  });

  it("lets Claude fix a problem with another lookup, running that turn's tools in parallel", async () => {
    const { client, create, sent } = fakeClient([
      msg([
        { type: "tool_use", id: "b", name: "get_music", input: { seed_ids: ["f1"] } },
        { type: "tool_use", id: "c", name: "get_places", input: { seed_ids: ["f1"] } },
      ]),
      msg([{ type: "tool_use", id: "d", name: "submit_kit", input: { ...empty, music: [{ id: "f1", why: "x" }] } }]),
    ]);
    const kit = await buildLiveKit(rosa, { client });
    expect(create).toHaveBeenCalledTimes(2);
    // All of a turn's results go back in one message.
    const lastUser = sent[1].body.messages.at(-1)!;
    expect(Array.isArray(lastUser.content) && lastUser.content.map((c) => (c as { tool_use_id: string }).tool_use_id)).toEqual(["b", "c"]);
    expect(kit.music.items[0]?.title).toBe("Frank Sinatra");
  });

  it("sends the same tools every turn, asks Claude to finish on the last one, and still ends if Claude never submits", async () => {
    const { client, create, sent } = fakeClient(Array.from({ length: 4 }, () => msg([{ type: "text", text: "thinking out loud" }], "end_turn")));
    const kit = await buildLiveKit(rosa, { client });
    expect(create).toHaveBeenCalledTimes(4);
    // Changing the tool list mid-conversation would invalidate Claude's earlier thinking blocks.
    for (const { body } of sent) expect(body.tools.map((t) => t.name)).toEqual(sent[0].body.tools.map((t) => t.name));
    expect(sent[0].body.tools.map((t) => t.name)).toContain("submit_kit");
    // The finish request goes into the user turn being sent, not into history already sent.
    expect(JSON.stringify(sent[3].body.messages.at(-1))).toContain(FINISH_NOW);
    for (const { body } of sent.slice(0, 3)) expect(JSON.stringify(body.messages)).not.toContain(FINISH_NOW);
    expect(kit.music).toMatchObject({ status: "gap", gapReason: "The agent didn't finish within its limits." });
  });

  it("refuses lookups once it's the last turn: only the up-front lookups reach Qloo", async () => {
    const { client, sent } = fakeClient([
      msg([{ type: "tool_use", id: "a", name: "resolve_favorite", input: { name: "Frank Sinatra", kind: "artist" } }]),
      msg([{ type: "tool_use", id: "b", name: "submit_kit", input: empty }]),
    ]);
    // A budget this short makes the first turn the last one.
    const kit = await buildLiveKit(rosa, { client, budgetMs: 30_000 });
    // One search for the favorite and the five usual lookups; Claude's extra lookup never runs.
    expect(vi.mocked(qlooGet).mock.calls.map((c) => c[0]).sort()).toEqual(["/search", ...Array(5).fill("/v2/insights")]);
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

  it("caches the tools and system prompt the same way on every turn, and not the person's message", async () => {
    const { client, sent } = fakeClient([
      msg([{ type: "tool_use", id: "b", name: "get_music", input: { seed_ids: ["SINATRA"] } }]),
      msg([{ type: "tool_use", id: "d", name: "submit_kit", input: empty }]),
    ]);
    await buildLiveKit(rosa, { client });
    for (const { body } of sent) {
      expect(body.system).toHaveLength(1);
      expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
      // A one-call kit never reads its message back, so caching it would only add the write premium.
      expect(body.cache_control).toBeUndefined();
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
