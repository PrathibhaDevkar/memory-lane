import rosaFixture from "@/fixtures/kits/rosa.json";
import { KitSchema, type Kit, type Profile } from "./types";

// KIT_SOURCE picks where kits come from:
//   "fixture" (default): the saved sample kit for Rosa, no API calls
//   "agent": the live agent (Qloo tools + Claude)
export type KitSource = "fixture" | "agent";

export function kitSource(): KitSource {
  const v = process.env.KIT_SOURCE ?? "fixture";
  if (v !== "fixture" && v !== "agent") throw new Error(`KIT_SOURCE="${v}" is not valid (use "fixture" or "agent")`);
  return v;
}

// Walking skeleton: every request gets Rosa's fixture kit. The caregiver's profile is
// echoed in provenance.note so the UI can say plainly that this isn't their kit yet.
export function fixtureKit(requested: Profile): Kit {
  const kit = KitSchema.parse(rosaFixture); // fails loudly if the fixture drifts from the contract
  return {
    ...kit,
    provenance: {
      ...kit.provenance,
      note: `${kit.provenance.note} You asked for ${requested.displayName} (born ${requested.birthYear}, ${requested.hometown}).`,
    },
  };
}
