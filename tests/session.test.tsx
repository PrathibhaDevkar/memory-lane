import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import rosa from "@/fixtures/kits/rosa.json";
import { EXAMPLE_PROFILE, IntakeForm } from "@/components/IntakeForm";
import { SessionMode } from "@/components/SessionMode";
import { SessionNote } from "@/components/SessionNote";
import { avoidNextTime, buildCards, buildCareNote, type SessionLog } from "@/lib/session";
import { kitAsText, whatsappUrl } from "@/lib/share";
import { KitSchema, type Kit } from "@/lib/types";

const kit = KitSchema.parse(rosa);
const morning = "2026-10-15T10:00:00";
const evening = "2026-10-15T18:30:00";
const log = (entries: SessionLog["entries"], startedAt = morning): SessionLog => ({ startedAt, entries });

describe("buildCards", () => {
  it("alternates one item with one question, so one idea is on screen at a time", () => {
    const kinds = buildCards(kit).map((c) => c.kind);
    expect(kinds.slice(0, 4)).toEqual(["song", "question", "song", "question"]);
    expect(kinds.filter((k) => k === "question")).toHaveLength(kit.prompts.length);
    expect(kinds).toContain("dish");
    expect(kinds).toContain("place");
  });

  it("uses comments instead of questions at the late level, and ends with ideas", () => {
    const late: Kit = {
      ...kit,
      profile: { ...kit.profile, supportLevel: "late" },
      prompts: ["This one was on the radio everywhere."],
      activityIdeas: [{ text: "A soft scarf to hold", source: "llm" }],
    };
    const cards = buildCards(late);
    expect(cards[1]).toMatchObject({ kind: "comment" });
    expect(cards.at(-1)).toMatchObject({ kind: "idea", title: "A soft scarf to hold" });
  });

  it("carries the search link for songs and films", () => {
    expect(buildCards(kit)[0].link?.href).toMatch(/^https:\/\/open\.spotify\.com\/search\//);
  });
});

describe("buildCareNote", () => {
  it("states only what was observed, plus gentle next steps", () => {
    const note = buildCareNote(
      kit,
      log([
        { cardId: "a", kind: "song", title: "Ella Fitzgerald", reaction: "lit_up" },
        { cardId: "b", kind: "question", title: "What music did people dance to?", reaction: "calm" },
        { cardId: "c", kind: "film", title: "Designing Woman (1957)", reaction: "not_interested" },
      ]),
    );
    expect(note).toContain("Reminiscence session with Rosa");
    expect(note).toContain("morning");
    expect(note).toContain("Lit up with: Ella Fitzgerald.");
    expect(note).toContain("Engaged with 1 of the questions.");
    expect(note).toContain("Not interested in: Designing Woman (1957).");
    expect(note).toContain("Next time: more like Ella Fitzgerald.");
    // Nothing that wasn't logged.
    expect(note).not.toMatch(/Nat King Cole|Maxwell Street|pizza/);
  });

  it("records a stop, and suggests an earlier time if it happened in the evening", () => {
    const note = buildCareNote(kit, log([{ cardId: "a", kind: "song", title: "Louis Armstrong", reaction: "stopped" }], evening));
    expect(note).toContain("Stopped at: Louis Armstrong.");
    expect(note).toContain("Next time: leave out Louis Armstrong and an earlier time of day may suit better.");
    expect(note).toContain("an earlier time of day may suit better");
  });

  it("only promises to leave out what the next kit can actually leave out", () => {
    const entries = [{ cardId: "i", kind: "idea" as const, title: "Hold a soft scarf", reaction: "stopped" as const }];
    expect(buildCareNote(kit, log(entries))).not.toContain("leave out");
    expect(avoidNextTime(log(entries))).toEqual([]);
  });

  it("treats 'not today' as useful information, not failure", () => {
    const note = buildCareNote(kit, log([{ cardId: "a", kind: "place", title: "Maxwell Street Market", reaction: "not_today" }]));
    expect(note).toContain(`Said "not today" to Maxwell Street Market. That's fine`);
  });

  it("handles a session that ended before anything was tried", () => {
    expect(buildCareNote(kit, log([]))).toContain("ended before anything was tried");
  });
});

describe("avoidNextTime", () => {
  it("adds items the session stopped at, without the year; never questions", () => {
    expect(
      avoidNextTime(
        log([
          { cardId: "a", kind: "film", title: "Designing Woman (1957)", reaction: "stopped" },
          { cardId: "b", kind: "question", title: "What was it like?", reaction: "stopped" },
        ]),
      ),
    ).toEqual(["Designing Woman"]);
  });
});

describe("share", () => {
  it("writes a plain-text kit with search links and a reminder that stopping is fine", () => {
    const text = kitAsText(kit);
    expect(text).toContain("Memory Lane session kit for Rosa");
    expect(text).toContain("• Ella Fitzgerald: https://open.spotify.com/search/");
    expect(text).toContain("to talk about, not to serve");
    expect(text).toContain("Stopping is a good outcome");
  });

  it("builds a WhatsApp link with the text encoded, and nothing else", () => {
    const url = whatsappUrl("Hello & goodbye\nline 2");
    expect(url).toBe("https://wa.me/?text=Hello%20%26%20goodbye%0Aline%202");
  });
});

describe("screens", () => {
  it("session mode shows the first card, its link, and the five reactions", () => {
    const html = renderToStaticMarkup(<SessionMode kit={kit} onEnd={() => {}} onBack={() => {}} />);
    expect(html).toContain("1 of ");
    expect(html).toContain("Ella Fitzgerald");
    for (const label of ["Lit up", "Calm", "Not interested", "Not today", "Stop"]) expect(html).toContain(`>${label}<`);
    expect(html).toContain("End session");
  });

  it("the note screen offers copy, WhatsApp and print, and says nothing is kept", () => {
    const html = renderToStaticMarkup(
      <SessionNote kit={kit} log={log([{ cardId: "a", kind: "song", title: "Ella Fitzgerald", reaction: "lit_up" }])} onBuildNext={() => {}} onBackToKit={() => {}} />,
    );
    expect(html).toContain("Lit up with: Ella Fitzgerald.");
    expect(html).toContain("Copy note");
    expect(html).toContain("https://wa.me/?text=");
    expect(html).toContain("doesn&#x27;t keep a copy");
  });

  // Safety: a new session must answer the sudden-change question afresh.
  it("asks the safety question again for the next session, even with other answers prefilled", () => {
    const html = renderToStaticMarkup(<IntakeForm initial={{ ...EXAMPLE_PROFILE, suddenChange: false }} askSafetyAgain busy={false} onSubmit={() => {}} />);
    expect(html.match(/name="[^"]*-sudden"[^>]*checked/)).toBeNull();
    expect(html).toContain('value="Rosa"');
  });
});
