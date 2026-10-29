import type { Profile } from "./types";

// Fictional persona from Phase 0, for demos and quick testing. The form's "Use example" button
// fills it in, and the live kit built for it can be reused (lib/kit-cache.ts).
export const EXAMPLE_PROFILE: Profile = {
  suddenChange: false,
  displayName: "Rosa",
  supportLevel: "early",
  birthYear: 1942,
  hometown: "Chicago",
  favorites: [{ text: "Frank Sinatra", kind: "artist" }],
  thingsToAvoid: ["none"],
};
