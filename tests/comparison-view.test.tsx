import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import rosa from "@/fixtures/kits/rosa.json";
import { CompareSection } from "@/components/CompareSection";
import { ComparisonView } from "@/components/ComparisonView";
import { comparisonRows, failureReason, outOf, pickChecks, UNCHECKED_NOTE } from "@/lib/compare-summary";
import { ComparisonSchema, KitSchema, type ComparedPick, type Comparison } from "@/lib/types";

// What a caregiver or judge sees next to Rosa's saved kit.

const kit = KitSchema.parse(rosa);
const era = kit.era; // 1952–1972

const pick = (p: Partial<ComparedPick> & Pick<ComparedPick, "section" | "title">): ComparedPick => ({ why: "A reason.", inQloo: "yes", inEra: "unknown", ...p });

const comparison: Comparison = ComparisonSchema.parse({
  mode: "comparison",
  provenance: { kind: "live", generatedAt: "2026-10-26T12:00:00.000Z" },
  profile: kit.profile,
  era,
  model: "claude-haiku-5-5",
  picks: [
    pick({ section: "music", title: "Frank Sinatra" }),
    // A real highlife musician Qloo didn't list in the first live run: unchecked, not wrong.
    pick({ section: "music", title: "Victor Olaiya", inQloo: "no" }),
    pick({ section: "music", title: "Dean Martin", inQloo: "unknown" }),
    pick({ section: "screen", title: "The Longest Day", year: 1962, qlooYear: 1962, inEra: "yes", screenedOut: "War film or series." }),
    pick({ section: "screen", title: "Casablanca", year: 1942, qlooYear: 1942, inEra: "no" }),
    pick({ section: "place", title: "Riverview Park", inQloo: "no" }),
    pick({ section: "dish", title: "Italian beef", inQloo: "unknown" }),
  ],
  questions: [
    { text: "Rosa, what music filled your home on a Saturday night?", keeps: true },
    { text: "Do you remember the first record you bought?", keeps: false, reason: "Asks them to remember, which can feel like a test." },
  ],
  trace: [{ id: "c1", kind: "llm", label: "Claude on its own", input: {}, outputSummary: "Picks and questions", excluded: [], ms: 9000, status: "ok" }],
});

describe("comparisonRows", () => {
  it("counts the kit from the kit itself and Claude's picks from the checks", () => {
    const rows = Object.fromEntries(comparisonRows(kit, comparison).map((r) => [r.check, [r.memoryLane, r.alone]]));
    expect(rows["Picks found in Qloo"]).toEqual(["All 10", "3 of 6 (1 couldn't be checked)"]);
    expect(rows["Films and shows from 1952–1972"]).toEqual(["All 3", "1 of 2"]);
    expect(rows["Picks the content filter or avoid list would leave out"]).toEqual(["None: every result is screened first", "1 pick"]);
    expect(rows["Questions that follow the question rules"]).toEqual(["All 5", "1 of 2"]);
    // Rosa's saved demo kit was picked by hand; a live kit was chosen by Claude.
    expect(rows["Where the picks come from"]).toEqual(["Qloo's taste graph (a saved sample)", "Claude's own knowledge, unchecked"]);
    const live = { ...kit, provenance: { kind: "live" as const, generatedAt: "2026-10-26" } };
    expect(comparisonRows(live, comparison).at(-1)?.memoryLane).toBe("Qloo's taste graph, chosen by Claude");
  });

  it("says comments for the late level, and handles empty lists", () => {
    const late = { ...kit, profile: { ...kit.profile, supportLevel: "late" as const }, prompts: [] };
    const rows = comparisonRows(late, { ...comparison, picks: [], questions: [] });
    expect(rows.map((r) => r.check)).toContain("Comments that follow the question rules");
    expect(rows.find((r) => r.check.startsWith("Comments"))).toMatchObject({ memoryLane: "None in this kit", alone: "None given" });
    expect(rows[0].alone).toBe("None to check");
  });

  it("writes counts in plain words", () => {
    expect(outOf(4, 4, "-")).toBe("All 4");
    expect(outOf(1, 1, "-")).toBe("1 of 1");
    expect(outOf(2, 5, "-")).toBe("2 of 5");
    expect(outOf(0, 0, "None given")).toBe("None given");
  });
});

describe("pickChecks", () => {
  const texts = (p: ComparedPick) => pickChecks(p, era).map((c) => `${c.ok}: ${c.text}`);

  it("says what was found, and what would be left out", () => {
    expect(texts(comparison.picks[0])).toEqual(["true: In Qloo"]);
    expect(texts(comparison.picks[1])).toEqual(["null: Not in Qloo under this name, so it can't be checked"]);
    expect(texts(comparison.picks[2])).toEqual(["null: Couldn't check Qloo this time"]);
    expect(texts(comparison.picks[3])).toEqual(["true: In Qloo", "true: Released 1962, in their years", "false: Would be left out: War film or series"]);
    // Claude's own year and Qloo's agree, and they're outside the window: a checked miss.
    expect(texts(comparison.picks[4])).toEqual(["true: In Qloo", "false: Released 1942, outside 1952–1972"]);
  });

  it("treats a year apart as the same film, and another film with the title as unchecked", () => {
    expect(texts(pick({ section: "screen", title: "Roman Holiday", year: 1952, qlooYear: 1953, inEra: "yes" }))).toEqual([
      "true: In Qloo",
      "true: Released 1953, in their years",
      "null: Claude said 1952",
    ]);
    expect(texts(pick({ section: "screen", title: "The Old Mill", year: 1954, inQloo: "no", qlooYear: 1995 }))).toEqual([
      "null: Qloo has this title from 1995, not 1954, so it can't be checked",
    ]);
  });

  it("never counts a pick Qloo can't confirm against Claude", () => {
    for (const section of ["music", "screen", "place", "dish"] as const) {
      for (const inQloo of ["no", "unknown"] as const) {
        for (const extra of [{}, { year: 1954, qlooYear: 1995 }]) {
          const [first, ...rest] = pickChecks(pick({ section, title: "Anything", inQloo, ...extra }), era);
          expect(first.ok).toBeNull();
          expect(rest.filter((c) => c.ok === false)).toEqual([]);
        }
      }
    }
  });

  it("claims only what was checked for places and dishes", () => {
    expect(texts(comparison.picks[5])).toEqual(["null: No place by this name in Qloo, so it can't be checked"]);
    expect(texts(pick({ section: "place", title: "Wrigley Field" }))).toEqual(["true: A place by this name is in Qloo"]);
    expect(texts(comparison.picks[6])).toEqual(["null: Not checked: dishes can't be looked up in Qloo"]);
  });
});

describe("failureReason", () => {
  it("names why a comparison couldn't be shown, without its wording", () => {
    expect(failureReason(503, { error: "…", reason: "not_live" })).toBe("not_live");
    expect(failureReason(503, { error: "Live requests are paused for now." })).toBe("paused");
    expect(failureReason(429, null)).toBe("limit");
    expect(failureReason(502, null)).toBe("server");
  });
});

describe("ComparisonView", () => {
  const html = renderToStaticMarkup(<ComparisonView kit={kit} comparison={comparison} />);

  it("shows the checks side by side, with labels that work on a phone", () => {
    expect(html).toContain("claude-haiku-5-5");
    // It never claims the kit was made by the same model: the demo kit was picked by hand.
    expect(html).not.toMatch(/Both used/);
    expect(html).toContain("Picks found in Qloo");
    expect(html).toContain("Memory Lane: </span>All 10");
    expect(html).toContain("Claude on its own: </span>3 of 6 (1 couldn&#x27;t be checked)");
  });

  it("lists Claude's picks and questions with what the checks found, labeled for comparison only", () => {
    expect(html).toContain("For comparison only: these picks aren&#x27;t used in sessions.");
    expect(html).toContain("Casablanca");
    expect(html).toContain("Released 1942, outside 1952–1972");
    expect(html).toContain("Would be dropped: Asks them to remember, which can feel like a test");
    expect(html).toContain("How the comparison was made");
    // No media links: these picks are never offered to play.
    expect(html).not.toContain("Search on");
  });

  it("says under the summary that a pick Qloo doesn't list isn't wrong, just unchecked", () => {
    expect(UNCHECKED_NOTE).toMatch(/isn't necessarily wrong/);
    expect(html).toContain("Qloo may not list it, or lists it under another name or year");
  });

  it("never accuses Claude of making things up", () => {
    // "Not found in Qloo" means unchecked (lib/compare.ts). Words like these would claim more than
    // any check did, here or in a demo (docs/submission.md, Claims we can make).
    const overclaim = /made[ -]up|invent|hallucinat|fabricat|fake|\bwrong\b(?! dates)/i;
    const shown = html.replace("isn&#x27;t necessarily wrong", "");
    expect(shown).not.toMatch(overclaim);
    for (const p of comparison.picks) for (const c of pickChecks(p, era)) expect(c.text).not.toMatch(overclaim);
  });

  it("says when a comparison is reused", () => {
    const reused = { ...comparison, provenance: { kind: "cached" as const, generatedAt: "2026-10-26", note: "Reused for a few hours." } };
    expect(renderToStaticMarkup(<ComparisonView kit={kit} comparison={reused} />)).toContain("Reused for a few hours.");
  });
});

describe("CompareSection", () => {
  it("offers the comparison under a kit", () => {
    const html = renderToStaticMarkup(<CompareSection kit={kit} />);
    expect(html).toContain("What does Qloo add?");
    expect(html).toContain("Compare with Claude on its own");
    expect(html).toContain("no-print");
  });

  it("shows a comparison already made for this kit straight away", () => {
    const html = renderToStaticMarkup(<CompareSection kit={kit} saved={comparison} />);
    expect(html).toContain("Memory Lane next to Claude on its own");
    expect(html).not.toContain("Compare with Claude on its own</button>");
  });
});
