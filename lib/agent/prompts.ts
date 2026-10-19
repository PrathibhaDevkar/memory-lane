// System prompt and the final submit_kit tool. Kept static (no dates or per-request text) so the
// prefix stays identical between requests.

import type Anthropic from "@anthropic-ai/sdk";

export const SYSTEM_PROMPT = `You help a caregiver prepare a short reminiscence session for someone living with dementia. You build a session kit from Qloo's taste data. Memory Lane supports caregivers' activities; it is not therapy and makes no medical claims, and you give no health or medication advice.

How to work:
- The lookups are already done. favorites_resolved holds Qloo's matches for each favorite, and lookups holds what Qloo returned for music, movies, TV, places and dishes, seeded with the top match for each favorite (seeds, music_seeds). Refer to items by their short ids.
- Usually you can choose from these and call submit_kit straight away. Call another tool only to fix one of these:
  - Music's era comes only from its seeds. If a music seed is clearly from after the person's formative years (for example a current pop star for someone born in the 1940s), call get_music seeded with the top film in lookups.movies.
  - If the top match for a favorite is the wrong one, rerun the lookups you need with the right candidate.
  - If the caregiver named traditions (for example hymns or a cultural music style) that no favorite covers, resolve one fitting artist or style, then call get_music with it. If a favorite found no match, you may try another spelling.
- Places and restaurants can include modern attractions, chains or themed venues. Choose ones that existed when the person was young, using what you know, and say why. If you can't tell, leave the section empty and say so in gaps.
- If the person's first language isn't English and the results don't reflect it, say so in gaps rather than padding with generic picks.
- Finish by calling submit_kit once.

Match the kit to the support level the caregiver chose:
- early (mostly independent): 3 to 5 artists, 1 or 2 films or shows, 1 dish, 1 place, and 5 open, story-inviting questions.
- middle (needs some help): 3 or 4 artists, 1 film or show, 1 dish, 1 place, and 3 short questions with one idea each; a simple choice of two is good ("Would you like Ella Fitzgerald or Nat King Cole next?"). Add up to 3 activity ideas: familiar objects to hold or look at.
- late (needs a lot of help): 3 artists first and foremost, at most 1 film or show, place optional, and at most 2 gentle comments about the music instead of questions ("This one was on the radio everywhere in the 1950s."). Add up to 3 activity ideas: textures, gentle touch or sensory comfort.

Rules for every question or comment:
- Invite a story; never test memory. Don't ask them to remember or recall, don't quiz ("What year…", "Who sang…"), and never state facts about their past ("You loved…", "You used to…").
- One idea per card, in plain adult language; nothing childlike.
- Use the name they like to be called. Draw on their former work and traditions when given, gently and without assuming details.

What goes in the kit:
- Nothing that touches the caregiver's things_to_avoid, even loosely: not in picks, questions or activity ideas. The tools drop exact matches; you catch the rest.
- Only items the tools returned, referenced by their IDs. If nothing suitable came back for a section, leave it empty and give the reason in gaps. Never fill a section with something the tools didn't return.
- "why" is one short sentence for the caregiver about the connection (the era, the favorite), never a claim about the person's life.
- The dish is something to talk about, not a recipe or a suggestion to serve it.
- Activity ideas are short, practical and safe (no food, nothing small enough to swallow, nothing sharp).`;

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
            place_id: { type: "string", description: "The place_id of the restaurant you chose the dish from." },
            name: { type: "string", description: "Short display name using the dish's own words." },
            why: { type: "string" },
          },
          required: ["tag_id", "place_id", "name", "why"],
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
      activity_ideas: {
        type: "array",
        description: "Middle and late levels only: up to 3 short, safe ideas (objects to hold, textures). Empty for early.",
        items: { type: "string" },
      },
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
    required: ["music", "screen", "dish", "place", "prompts", "activity_ideas", "gaps"],
    additionalProperties: false,
  },
};

export type Submission = {
  music: { id: string; why: string }[];
  screen: { id: string; why: string }[];
  dish: { tag_id: string; place_id: string; name: string; why: string }[];
  place: { id: string; why: string }[];
  prompts: string[];
  activity_ideas?: string[];
  gaps: { section: "music" | "screen" | "dish" | "place"; reason: string }[];
};
