import { describe, expect, it } from "vitest";
import rosa from "@/fixtures/kits/rosa.json";
import { eraWindow } from "@/lib/era";
import { KitSchema } from "@/lib/types";

const kit = KitSchema.parse(rosa);

describe("Rosa fixture kit", () => {
  it("is labeled as a fixture, so it can't pass for a live run", () => {
    expect(kit.provenance.kind).toBe("fixture");
  });

  it("uses the era window from lib/era", () => {
    expect(kit.era).toEqual(eraWindow(kit.profile.birthYear, 2026));
  });

  it("has every film/show inside the era window (D1)", () => {
    for (const item of kit.screen.items) {
      expect(item.year).toBeGreaterThanOrEqual(kit.era.start);
      expect(item.year).toBeLessThanOrEqual(kit.era.end);
    }
  });

  it("contains nothing the D3 filter excluded", () => {
    const shown = kit.screen.items.map((i) => i.title);
    const excluded = kit.trace.flatMap((t) => t.excluded.map((e) => e.title.replace(/ \(\d{4}\)$/, "")));
    for (const title of excluded) expect(shown).not.toContain(title);
  });

  it("has only open questions as prompts, never statements", () => {
    for (const p of kit.prompts) {
      expect(p.trim().endsWith("?") || /^tell me/i.test(p)).toBe(true);
      expect(p).not.toMatch(/^(you (loved|used to|were)|remember when you)/i);
    }
  });
});
