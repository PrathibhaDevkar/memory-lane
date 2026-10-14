import type { EraWindow } from "./types";

// "Formative window" = ages 10–30, when the reminiscence bump peaks (approach.md, Phase 0).
// Every movie/TV Qloo call uses this window as filter.release_year (D1), so it lives in code,
// never in Claude's tool input.
export const ERA_START_AGE = 10;
export const ERA_END_AGE = 30;

export function eraWindow(birthYear: number, currentYear = new Date().getFullYear()): EraWindow {
  if (!Number.isInteger(birthYear)) throw new RangeError(`birthYear must be an integer, got ${birthYear}`);
  const start = birthYear + ERA_START_AGE;
  // Never ask Qloo for releases from the future.
  const end = Math.min(birthYear + ERA_END_AGE, currentYear);
  if (start > end) throw new RangeError(`no formative window yet for birth year ${birthYear}`);
  return { start, end };
}
