// Reuses the live kit built for the form's example profile, a fictional person, so repeat clicks on
// "Use example" don't spend Claude tokens. Only that example is ever kept: nothing about a real
// person is stored. Without Redis, every request builds a fresh kit.

import { EXAMPLE_PROFILE } from "@/lib/example-profile";
import { redis } from "@/lib/redis";
import { KitSchema, ProfileSchema, type Kit, type Profile } from "@/lib/types";

const KEY = "ml:example-kit:v1";

/** A positive whole number from the environment, or the fallback for blank or invalid values. */
function count(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : fallback;
}

export const EXAMPLE_KIT_HOURS = count(process.env.EXAMPLE_KIT_HOURS, 6);

export const REUSED_NOTE =
  "This kit was built live for the example profile and is reused for a few hours, so repeat clicks don't call Claude again. Change any detail to build a fresh kit.";

/** JSON with object keys in a fixed order, so equal profiles compare equal. */
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

const EXAMPLE = canonical(ProfileSchema.parse(EXAMPLE_PROFILE));

export function isExampleProfile(profile: Profile): boolean {
  return canonical(profile) === EXAMPLE;
}

/** The stored example kit, labeled as reused, or null. */
export async function reusedExampleKit(profile: Profile): Promise<Kit | null> {
  if (!redis || !isExampleProfile(profile)) return null;
  try {
    const stored = KitSchema.safeParse(await redis.get(KEY));
    if (!stored.success) return null;
    const kit = stored.data;
    return { ...kit, provenance: { kind: "cached", generatedAt: kit.provenance.generatedAt, note: REUSED_NOTE } };
  } catch (err) {
    console.error("Example kit read failed:", err);
    return null;
  }
}

/** Keeps a good live kit for the example profile for EXAMPLE_KIT_HOURS. */
export async function saveExampleKit(profile: Profile, kit: Kit): Promise<void> {
  const sections = [kit.music, kit.screen, kit.dish, kit.place].filter((s) => s.status === "ok").length;
  if (!redis || kit.provenance.kind !== "live" || sections < 2 || !isExampleProfile(profile)) return;
  try {
    await redis.set(KEY, kit, { ex: EXAMPLE_KIT_HOURS * 3600 });
  } catch (err) {
    console.error("Example kit save failed:", err);
  }
}
