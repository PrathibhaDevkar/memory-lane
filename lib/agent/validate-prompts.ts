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

export function promptProblem(p: string, level: SupportLevel = "early"): string | null {
  const t = p.trim();
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

export function validatePrompts(prompts: string[], level: SupportLevel = "early") {
  const limits = KIT_LIMITS[level];
  const kept: string[] = [];
  const dropped: { title: string; reason: string }[] = [];
  for (const p of prompts) {
    const problem = promptProblem(p, level);
    if (problem) dropped.push({ title: p, reason: problem });
    else if (kept.length < limits.prompts) kept.push(p.trim());
    else dropped.push({ title: p, reason: `More than ${limits.prompts} for this support level.` });
  }
  const open = kept.filter((p) => OPEN_START.test(p)).length;
  return { kept, dropped, open, meetsLevel: open >= limits.minOpenPrompts };
}
