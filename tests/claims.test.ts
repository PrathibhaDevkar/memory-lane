import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// What we tell judges says what the comparison's checks found, and no more (docs/submission.md,
// "Claims we can make"). A pick Qloo doesn't list is unchecked, not something Claude made up: in the
// first live comparison Qloo didn't list two real highlife musicians. This catches the obvious slips
// in the files judges read. Words in quotes are being discussed, not claimed, so they're skipped.

const FILES = ["README.md", "docs/submission.md", "docs/plan.md"];

const OVERCLAIM =
  /\b(?:made[ -]up|hallucinat\w*|fabricat\w*)\b|\bClaude (?:invents?|invented|makes? (?:things|it|them) up)\b|\b(?:invented|fake) (?:artists?|musicians?|picks?|songs?|films?|shows?|places?|dishes?)\b/i;

/** The text without anything in quotes or backticks. */
const unquoted = (line: string) => line.replace(/“[^”]*”|"[^"]*"|`[^`]*`/g, "");

export function overclaims(text: string): { line: number; text: string }[] {
  return text
    .split("\n")
    .map((t, i) => ({ line: i + 1, text: t }))
    .filter(({ text: t }) => OVERCLAIM.test(unquoted(t)));
}

describe("claims judges read", () => {
  it.each(FILES)("%s never calls a pick made up", (file) => {
    expect(overclaims(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("catches the slips it's for, and lets quoted or unrelated words through", () => {
    for (const slip of [
      "Claude on its own made up three artists for Mr. Okafor.",
      "Without Qloo, Claude hallucinated picks.",
      "Claude invented songs that don't exist.",
      "Two fabricated films.",
    ]) {
      expect(overclaims(slip)).toHaveLength(1);
    }
    for (const fine of [
      'Never say a pick is "made up" or "hallucinated".',
      "Nothing in a kit is invented: every pick traces back to a Qloo result.",
      "No memory tests, no invented memories.",
      "A pick Qloo doesn't list is unchecked, not a mistake.",
    ]) {
      expect(overclaims(fine)).toEqual([]);
    }
  });
});
