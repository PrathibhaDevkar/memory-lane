// System prompt and the final submit_kit tool. Kept static (no dates or per-request text) so the
// prefix stays identical between requests.

import type Anthropic from "@anthropic-ai/sdk";

export const SYSTEM_PROMPT = `You help a caregiver prepare a short reminiscence session for someone living with dementia. You build a session kit from Qloo's taste data using the tools. Memory Lane supports caregivers' activities; it is not therapy and makes no medical claims.

How to work:
- First call resolve_favorite for every favorite, all in one turn.
- Then, in one turn, call get_music, get_screen (movie), get_screen (tv), get_places and get_dish together, seeded with the resolved favorites' IDs.
- Music's era comes only from its seeds. If a favorite is clearly from after the person's formative years (for example a current pop star for someone born in the 1940s), don't seed music with it: seed get_screen with it, then seed get_music with the top film that get_screen returns.
- Places and restaurants can include modern attractions, chains or themed venues. Choose ones that existed when the person was young, using what you know, and say why.
- Finish by calling submit_kit once.

What goes in the kit:
- Only items the tools returned, referenced by their IDs: 3 to 5 artists, 1 or 2 films or shows, 1 dish, 1 place. If nothing suitable came back for a section, leave it empty and give the reason in gaps. Never fill a section with something the tools didn't return.
- "why" is one short sentence for the caregiver about the connection (the era, the favorite), never a claim about the person's life.
- Five conversation questions: open-ended and gentle, with no right answer, inviting a story rather than testing memory. Never state facts about the person's past ("You loved…", "Remember when you…"). Tie some of them to the picks.
- The dish is something to talk about, not a recipe or a suggestion to serve it.`;

export const SUBMIT_KIT: Anthropic.Beta.BetaTool = {
  name: "submit_kit",
  description: "Submit the finished session kit. Call exactly once, at the end.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      music: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, why: { type: "string" } },
          required: ["id", "why"],
          additionalProperties: false,
        },
      },
      screen: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, why: { type: "string" } },
          required: ["id", "why"],
          additionalProperties: false,
        },
      },
      dish: {
        type: "array",
        description: "At most one.",
        items: {
          type: "object",
          properties: {
            tag_id: { type: "string" },
            name: { type: "string", description: "Short display name using the dish's own words." },
            why: { type: "string" },
          },
          required: ["tag_id", "name", "why"],
          additionalProperties: false,
        },
      },
      place: {
        type: "array",
        description: "At most one.",
        items: {
          type: "object",
          properties: { id: { type: "string" }, why: { type: "string" } },
          required: ["id", "why"],
          additionalProperties: false,
        },
      },
      prompts: { type: "array", items: { type: "string" } },
      gaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section: { type: "string", enum: ["music", "screen", "dish", "place"] },
            reason: { type: "string" },
          },
          required: ["section", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["music", "screen", "dish", "place", "prompts", "gaps"],
    additionalProperties: false,
  },
};

export type Submission = {
  music: { id: string; why: string }[];
  screen: { id: string; why: string }[];
  dish: { tag_id: string; name: string; why: string }[];
  place: { id: string; why: string }[];
  prompts: string[];
  gaps: { section: "music" | "screen" | "dish" | "place"; reason: string }[];
};
