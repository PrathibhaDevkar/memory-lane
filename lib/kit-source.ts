import rosaFixture from "@/fixtures/kits/rosa.json";
import { KitSchema, type Kit, type Profile } from "./types";

// KIT_SOURCE picks where kits come from. Phase 1 only has "fixture"; Phase 2 adds "agent".
export type KitSource = "fixture";

export function kitSource(): KitSource {
  const v = process.env.KIT_SOURCE ?? "fixture";
  if (v !== "fixture") throw new Error(`KIT_SOURCE="${v}" is not available yet (only "fixture")`);
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
