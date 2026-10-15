// Care-practice wording and limits in one place, so the form, the kit, the agent and the
// question checker all agree (docs/plan.md §4.2). Change wording here, nowhere else.

import type { SupportLevel } from "./types";

export const SUPPORT_LEVELS: Record<SupportLevel, { label: string; description: string }> = {
  early: {
    label: "Mostly independent",
    description: "Enjoys conversation and stories, with a little help finding words.",
  },
  middle: {
    label: "Needs some help",
    description: "Does best with one short question at a time and simple choices.",
  },
  late: {
    label: "Needs a lot of help",
    description: "Music, touch and calm company matter more than questions.",
  },
};

// What the kit holds at each level. Questions per level are enforced by validate-prompts.ts.
export const KIT_LIMITS: Record<SupportLevel, { music: number; screen: number; prompts: number; minOpenPrompts: number }> = {
  early: { music: 5, screen: 2, prompts: 5, minOpenPrompts: 3 },
  middle: { music: 4, screen: 1, prompts: 3, minOpenPrompts: 0 },
  late: { music: 3, screen: 1, prompts: 2, minOpenPrompts: 0 },
};

/** Signs of distress to watch for during a session. Same at every level, shown on every kit. */
export const WATCH_FOR = [
  "Grimacing or a pained look",
  "Moaning, crying or calling out",
  "A tense body, clenched hands or pulling away",
  "Restlessness or trying to leave",
  "Tears or sudden quiet",
];
export const WATCH_FOR_ACTION =
  "If you see these, pause. Switch to something familiar and calming, or stop for today. Stopping is a good outcome.";

export const SUDDEN_CHANGE_QUESTION =
  "Has there been a sudden change in the last few hours or days? For example new confusion, unusual drowsiness, or not recognizing people they know well.";

export const SAFETY_STOP_MESSAGE =
  "A sudden change can have a medical cause, such as an infection, dehydration or a reaction to medication. Please tell their nurse or doctor now. A reminiscence session isn't the right activity for today; try again once they've been checked.";
