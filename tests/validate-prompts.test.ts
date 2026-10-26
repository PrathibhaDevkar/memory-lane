import { describe, expect, it } from "vitest";
import { checkPrompts, promptProblem, validatePrompts } from "@/lib/agent/validate-prompts";

describe("promptProblem (D10: care-practice question rules)", () => {
  it.each([
    "What music did people dance to back then?",
    "Which song would you like to hear first?",
    "How did you get to work when you were a teacher?",
    "Tell me about a street you liked to walk down.",
    "Would you like Ella Fitzgerald or Nat King Cole next?",
  ])("allows an invitation: %s", (p) => {
    expect(promptProblem(p)).toBeNull();
  });

  it.each([
    ["Do you remember the first record you bought?", /remember/],
    ["Can you recall your wedding song?", /remember/],
    ["You loved Sinatra, didn't you?", /states something/i],
    ["Remember when you went to the market?", /states something/i],
    ["What year did Designing Woman come out?", /quiz/i],
    ["Who sang Fly Me to the Moon?", /quiz/i],
    ["How old were you when you moved to Chicago?", /quiz/i],
    ["What was your favorite song? Who did you dance with?", /two questions/i],
    ["Was that yummy pizza your favorite?", /adult/i],
    ["Sinatra was very popular.", /not a question/i],
  ])("rejects %s", (p, reason) => {
    expect(promptProblem(p)).toMatch(reason);
  });

  it("reads past the name a card opens with (cards from the first live run)", () => {
    expect(promptProblem("Rosa, tell me about a place in Chicago that felt like home to you.")).toBeNull();
    expect(promptProblem("Mr. Okafor, would you like to hear Tony Allen or Manu Dibango next?")).toBeNull();
    // The rules still apply after the name.
    expect(promptProblem("Rosa, you loved Sinatra, didn't you?")).toMatch(/states something/i);
    expect(promptProblem("Walt, remember when Sun Studio opened?")).toMatch(/states something/i);
    expect(promptProblem("Rosa, Sinatra was very popular.")).toMatch(/not a question/i);
  });

  it("allows a short comment about the music only at the late level", () => {
    const comment = "This one was on the radio everywhere in the 1950s.";
    expect(promptProblem(comment, "late")).toBeNull();
    expect(promptProblem(comment, "early")).toMatch(/not a question/i);
    // Even a comment may not describe the person's past.
    expect(promptProblem("You always sang along to this one.", "late")).toMatch(/states something/i);
  });
});

describe("validatePrompts (per support level)", () => {
  const five = [
    "What music did people dance to back then?",
    "Which singer's voice do you like best?",
    "What was going to the movies like?",
    "What foods remind you of home?",
    "Tell me about a market you liked.",
  ];

  it("early keeps up to 5 and counts open questions", () => {
    const r = validatePrompts(five, "early");
    expect(r.kept).toHaveLength(5);
    expect(r.open).toBe(5);
    expect(r.meetsLevel).toBe(true);
  });

  it("middle keeps at most 3; late at most 2", () => {
    expect(validatePrompts(five, "middle").kept).toHaveLength(3);
    const late = validatePrompts(five, "late");
    expect(late.kept).toHaveLength(2);
    expect(late.dropped.at(-1)!.reason).toMatch(/more than 2/i);
  });

  it("counts a question that opens with the person's name as open", () => {
    const named = [
      "Rosa, what was it like going out for an evening in Chicago?",
      "Mr. Okafor, what did you enjoy most about teaching maths?",
      "What makes a burger taste just right to you, June?",
      "Rosa, is there a film that has stayed with you?",
    ];
    const r = validatePrompts(named, "early");
    expect(r.kept).toHaveLength(4);
    expect(r.open).toBe(3);
    expect(r.meetsLevel).toBe(true);
  });

  it("flags an early kit with too few open questions", () => {
    expect(validatePrompts(["Would you like this song?"], "early").meetsLevel).toBe(false);
  });
});

describe("checkPrompts (each card, in order, for the comparison)", () => {
  it("gives every card its reason, the level's count included, and agrees with validatePrompts", () => {
    const cards = ["Do you remember your first dance?", "What music did people dance to?", "Which song should we play next?", "How did you spend a Sunday?"];
    expect(checkPrompts(cards, "late").map((c) => c.problem)).toEqual([
      "Asks them to remember, which can feel like a test.",
      null,
      null,
      "More than 2 for this support level.",
    ]);
    const { kept, dropped } = validatePrompts(cards, "late");
    expect(kept).toEqual(cards.slice(1, 3));
    expect(dropped.map((d) => d.title)).toEqual([cards[0], cards[3]]);
  });
});
