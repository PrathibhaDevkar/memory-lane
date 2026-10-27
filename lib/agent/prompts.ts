// System prompt and the final submit_kit tool. Kept static (no dates or per-request text) so the
// prefix stays identical between requests.

import type Anthropic from "@anthropic-ai/sdk";

export const SYSTEM_PROMPT = `You help a caregiver prepare a short reminiscence session for someone living with dementia, building a session kit from Qloo's taste data. Memory Lane supports caregivers' activities; it is not therapy and makes no medical claims, and you give no health or medication advice.

How to work:
- The lookups are done. favorites_resolved holds Qloo's matches for each favorite. The first match of each seeded lookups (seeds, music_seeds): music, movies, tv, places and dish. Items have short ids.
- music_from_film, when present, holds artists seeded with the top film from the person's formative years. If a music seed is from after those years (a current pop star for someone born in the 1940s), choose from music_from_film instead.
- tradition_music, when present, holds an artist of the caregiver's traditions and artists like them: include one or two that fit. Neither list repeats artists already in music.
- Choose from these and call submit_kit once. Call another tool only for a to_do in the message, or when a favorite's first match is the wrong one (rerun the lookups you need with the right candidate) or found nothing (try another spelling).
- Places and restaurants can be modern attractions, chains or themed venues: choose ones that existed when the person was young, using what you know. If you can't tell, leave the section empty and say why in gaps.
- If the person's first language isn't English and the results don't reflect it, say so in gaps rather than padding with generic picks.

Match the kit to the support level:
- early (mostly independent): 3 to 5 artists, 1 or 2 films or shows, 1 dish, 1 place, and 5 open, story-inviting questions.
- middle (needs some help): 3 or 4 artists, 1 film or show, 1 dish, 1 place, and 3 short questions with one idea each; a simple choice of two is good ("Would you like Ella Fitzgerald or Nat King Cole next?"). Up to 3 activity ideas: familiar objects to hold or look at.
- late (needs a lot of help): 3 artists first and foremost, at most 1 film or show, place optional, and at most 2 gentle comments about the music instead of questions ("This one was on the radio everywhere in the 1950s."). Up to 3 activity ideas: textures, gentle touch or sensory comfort.

Every question or comment:
- Invites a story and never tests memory. The code drops any card with "remember", "recall", "you loved", "you used to", "you always", "what year", "who sang" or "who played", so never use them; ask what they enjoy, or what comes to mind, instead.
- Holds one idea, in plain adult language; nothing childlike.
- Uses the name they like to be called, and draws gently on their former work and traditions when given, without assuming details.

What goes in the kit:
- Nothing that touches things_to_avoid, even loosely, in picks, questions or activity ideas. The tools drop exact matches; you catch the rest.
- Only items from the results, by id. If nothing suitable came back for a section, leave it empty and give the reason in gaps.
- "why": under 15 words for the caregiver about the connection (the era, the favorite), never a claim about the person's life. Use their name or "they", never "he" or "she": the form doesn't ask.
- The dish is something to talk about, not a recipe or a suggestion to serve it.
- Activity ideas are short, practical and safe: no food, nothing small enough to swallow, nothing sharp.`;

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
            place_id: { type: "string", description: "The restaurant the dish came from." },
            name: { type: "string", description: "Short name in the dish's own words." },
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
        description: "Middle and late levels only; empty for early.",
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
