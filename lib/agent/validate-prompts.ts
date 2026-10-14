// Conversation prompts must be gentle open questions, never statements about the person's past
// (approach.md rules; implementation-plan.md §5). Failing prompts are dropped with a reason.

const PRESUMES = /^(you\b|remember when\b)|\byou (loved|used to|were always|always)\b/i;
const OPEN_START = /^(what|how|who|where|which|why|tell me)\b/i;

export function promptProblem(p: string): string | null {
  const t = p.trim();
  if (t.length < 8) return "Too short.";
  if (t.length > 220) return "Too long for a conversation prompt.";
  if (PRESUMES.test(t)) return "States something about the person's past instead of asking.";
  if (!t.endsWith("?") && !/^tell me\b/i.test(t)) return "Not a question.";
  return null;
}

export function validatePrompts(prompts: string[]) {
  const kept: string[] = [];
  const dropped: { title: string; reason: string }[] = [];
  for (const p of prompts) {
    const problem = promptProblem(p);
    if (problem) dropped.push({ title: p, reason: problem });
    else kept.push(p.trim());
  }
  const open = kept.filter((p) => OPEN_START.test(p)).length;
  return { kept: kept.slice(0, 6), dropped, open };
}
