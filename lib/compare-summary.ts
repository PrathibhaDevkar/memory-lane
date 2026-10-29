// The comparison in plain words (components/ComparisonView.tsx): each check, for the kit Memory Lane
// built and for Claude on its own. Pure, so it runs in the browser and in tests. The kit's numbers
// are counted from the kit itself, not assumed; Claude's come from the checks in lib/compare.ts.

import { checkPrompts } from "@/lib/agent/validate-prompts";
import type { ComparedPick, Comparison, EraWindow, Kit } from "@/lib/types";

export type ComparisonRow = { check: string; memoryLane: string; alone: string };

/**
 * What "not found" means, shown under the summary. A pick Qloo doesn't list isn't wrong: Qloo may
 * not have it, or have it under another name or year. It just can't be checked, and a kit uses only
 * what Qloo returns, so Memory Lane would leave it out. Only checks that ran count against Claude.
 */
export const UNCHECKED_NOTE =
  "A pick that isn't found in Qloo isn't necessarily wrong: Qloo may not list it, or lists it under another name or year. It just can't be checked, so Memory Lane wouldn't use it.";

/** "All 4", "3 of 4", "1 of 1", or the fallback when there's nothing to count. */
export function outOf(n: number, total: number, none: string): string {
  if (total === 0) return none;
  return n === total && total > 1 ? `All ${total}` : `${n} of ${total}`;
}

const notChecked = (n: number) => (n ? ` (${n} couldn't be checked)` : "");

export function comparisonRows(kit: Kit, comparison: Comparison): ComparisonRow[] {
  const { era } = kit;
  const level = kit.profile.supportLevel;
  const picks = comparison.picks;

  // Memory Lane's picks, counted from the kit.
  const kitItems = [...kit.music.items, ...kit.screen.items, ...kit.place.items, ...kit.dish.items];
  const fromQloo = kitItems.filter((i) => i.source === "qloo").length;
  const kitScreenInYears = kit.screen.items.filter((i) => i.year !== undefined && i.year >= era.start && i.year <= era.end).length;
  const kitQuestions = checkPrompts(kit.prompts, level).filter((c) => !c.problem).length;

  // Claude's picks, as checked against Qloo. Dishes aren't Qloo entities, so they aren't counted.
  const checkable = picks.filter((p) => p.section !== "dish");
  const screen = picks.filter((p) => p.section === "screen");
  const count = (list: ComparedPick[], key: "inQloo" | "inEra", value: ComparedPick["inQloo"]) => list.filter((p) => p[key] === value).length;
  const leftOut = picks.filter((p) => p.screenedOut).length;
  const kept = comparison.questions.filter((q) => q.keeps).length;
  const questions = level === "late" ? "Comments" : "Questions";

  return [
    {
      check: "Picks found in Qloo",
      memoryLane: outOf(fromQloo, kitItems.length, "None in this kit"),
      alone: outOf(count(checkable, "inQloo", "yes"), checkable.length, "None to check") + notChecked(count(checkable, "inQloo", "unknown")),
    },
    {
      check: `Films and shows from ${era.start}–${era.end}`,
      memoryLane: outOf(kitScreenInYears, kit.screen.items.length, "None in this kit"),
      alone: outOf(count(screen, "inEra", "yes"), screen.length, "None given") + notChecked(count(screen, "inEra", "unknown")),
    },
    {
      // Every Qloo result is screened before anything is picked from it, so a kit can't hold one.
      check: "Picks the content filter or avoid list would leave out",
      memoryLane: "None: every result is screened first",
      alone: leftOut ? `${leftOut} ${leftOut === 1 ? "pick" : "picks"}` : "None",
    },
    {
      check: `${questions} that follow the question rules`,
      memoryLane: outOf(kitQuestions, kit.prompts.length, "None in this kit"),
      alone: outOf(kept, comparison.questions.length, "None given"),
    },
    {
      check: "Where the picks come from",
      // The saved demo kits were picked by hand from Qloo results, without a Claude call.
      memoryLane: kit.provenance.kind === "fixture" ? "Qloo's taste graph (a saved sample)" : "Qloo's taste graph, chosen by Claude",
      alone: "Claude's own knowledge, unchecked",
    },
  ];
}

/** Why a comparison couldn't be shown, for analytics (no wording or profile details). */
export function failureReason(status: number, body: unknown): "not_live" | "limit" | "paused" | "server" {
  if (status === 503 && (body as { reason?: unknown } | null)?.reason === "not_live") return "not_live";
  if (status === 429) return "limit";
  if (status === 503) return "paused";
  return "server";
}

/** One check on one of Claude's picks: passed (true), failed (false) or not checked (null). */
export type PickCheck = { ok: boolean | null; text: string };

export function pickChecks(pick: ComparedPick, era: EraWindow): PickCheck[] {
  const checks: PickCheck[] = [];
  if (pick.section === "dish") {
    checks.push({ ok: null, text: "Not checked: dishes can't be looked up in Qloo" });
  } else if (pick.inQloo === "unknown") {
    checks.push({ ok: null, text: "Couldn't check Qloo this time" });
  } else if (pick.inQloo === "no") {
    // Unchecked, not wrong (UNCHECKED_NOTE): never a failure.
    checks.push({ ok: null, text: unchecked(pick) });
  } else {
    // Places are matched by name only: the town isn't checked.
    checks.push({ ok: true, text: pick.section === "place" ? "A place by this name is in Qloo" : "In Qloo" });
  }
  if (pick.section === "screen" && pick.inQloo === "yes") {
    if (pick.inEra === "yes") checks.push({ ok: true, text: `Released ${pick.qlooYear}, in their years` });
    else if (pick.inEra === "no") checks.push({ ok: false, text: `Released ${pick.qlooYear}, outside ${era.start}–${era.end}` });
    else checks.push({ ok: null, text: "Qloo has no release year" });
    // Within a year (release dates vary by country), so information, not a mistake.
    if (pick.year && pick.qlooYear && pick.year !== pick.qlooYear) checks.push({ ok: null, text: `Claude said ${pick.year}` });
  }
  if (pick.screenedOut) checks.push({ ok: false, text: `Would be left out: ${pick.screenedOut.replace(/\.$/, "")}` });
  return checks;
}

/** Why a pick couldn't be checked in Qloo, in words that don't blame anyone. */
function unchecked(pick: ComparedPick): string {
  if (pick.section === "screen" && pick.qlooYear && pick.year) return `Qloo has this title from ${pick.qlooYear}, not ${pick.year}, so it can't be checked`;
  if (pick.section === "place") return "No place by this name in Qloo, so it can't be checked";
  return "Not in Qloo under this name, so it can't be checked";
}
