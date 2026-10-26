// Conversation prompts follow care-practice communication rules (docs/plan.md §4.2, D10):
// invite stories, never test memory or state facts about the person's past; one idea per card;
// adult language. What's allowed also depends on the support level. Failing prompts are dropped
// with a reason, never rewritten.

import { KIT_LIMITS } from "@/lib/care";
import type { SupportLevel } from "@/lib/types";

const PRESUMES = /^(you\b|remember when\b)|\byou (loved|used to|were always|always|once)\b/i;
const TESTS_MEMORY = /\bremember(ed)?\b|\brecall\b/i;
const QUIZ = /\b(what|which) year\b|\bwhat was (the|his|her|their) name\b|\bwhat'?s (the|his|her|their) name\b|\bwho (sang|starred|played|wrote)\b|\bhow old were you\b|\bwhat date\b/i;
const CHILDLIKE = /\b(yummy|doggy|kitty|choo[- ]choo|nap ?time|sweetie|good (boy|girl|job)|well done|potty|silly billy)\b/i;
const OPEN_START = /^(what|how|who|where|which|why|tell me)\b/i;
// A name the card opens with ("Rosa, …", "Mr. Okafor, …"): up to three capitalized words and a comma.
const ADDRESS = /^[A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){0,2},\s+/;

/** The card without the name it opens with, so "Rosa, what…" is checked as "what…". */
const body = (p: string) => p.trim().replace(ADDRESS, "");

export function promptProblem(p: string, level: SupportLevel = "early"): string | null {
  const t = body(p);
  if (t.length < 8) return "Too short.";
  if (t.length > 220) return "Too long for one card.";
  if (PRESUMES.test(t)) return "States something about the person's past instead of asking.";
  if (TESTS_MEMORY.test(t)) return "Asks them to remember, which can feel like a test.";
  if (QUIZ.test(t)) return "Sounds like a quiz question.";
  if (CHILDLIKE.test(t)) return "Not adult language.";
  if ((t.match(/\?/g) ?? []).length > 1) return "Two questions on one card.";
  const isQuestion = t.endsWith("?") || /^tell me\b/i.test(t);
  // At the late level a short, warm comment about the music is enough; questions stay optional.
  if (!isQuestion && level !== "late") return "Not a question.";
  if (!isQuestion && t.length > 140) return "Too long for a gentle comment.";
  return null;
}

/** Each card in order, with the reason the rules drop it (null when it's kept). */
export function checkPrompts(prompts: string[], level: SupportLevel = "early"): { text: string; problem: string | null }[] {
  const limit = KIT_LIMITS[level].prompts;
  let kept = 0;
  return prompts.map((text) => {
    const problem = promptProblem(text, level) ?? (kept < limit ? null : `More than ${limit} for this support level.`);
    if (!problem) kept++;
    return { text, problem };
  });
}

export function validatePrompts(prompts: string[], level: SupportLevel = "early") {
  const checked = checkPrompts(prompts, level);
  const kept = checked.filter((c) => !c.problem).map((c) => c.text.trim());
  const dropped = checked.flatMap((c) => (c.problem ? [{ title: c.text, reason: c.problem }] : []));
  const open = kept.filter((p) => OPEN_START.test(body(p))).length;
  return { kept, dropped, open, meetsLevel: open >= KIT_LIMITS[level].minOpenPrompts };
}
