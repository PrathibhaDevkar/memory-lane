// Demo personas for judges and first-time visitors (docs/plan.md §12.7). Each one opens instantly
// in the browser: no API call, no wait, no rate limit, no cost (official rules: the demo must be
// available "without any restriction" until judging ends).
//
// Kits are saved runs, labeled as such in the UI. To add one, run the live agent and save it:
//   node scripts/smoke.mjs http://localhost:3000 <persona> --save
// then import the written fixtures/kits/<persona>.json below.

import rosa from "@/fixtures/kits/rosa.json";
import { SAFETY_STOP_MESSAGE } from "./care";
import { KitSchema, type KitResponse } from "./types";

export type Demo = { id: string; name: string; description: string; response: KitResponse };

export const DEMOS: Demo[] = [
  {
    id: "rosa",
    name: "Rosa",
    description: "Born 1942 in Chicago, loves Frank Sinatra",
    response: KitSchema.parse(rosa), // fails loudly if a saved kit drifts from the contract
  },
  {
    id: "margaret",
    name: "Margaret",
    description: "A sudden change today: the safety check",
    response: {
      mode: "safety_stop",
      message: SAFETY_STOP_MESSAGE,
      profile: {
        suddenChange: true,
        displayName: "Margaret",
        supportLevel: "middle",
        birthYear: 1940,
        hometown: "Boston",
        favorites: [{ text: "Doris Day", kind: "artist" }],
        thingsToAvoid: ["none"],
      },
    },
  },
];
