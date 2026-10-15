import { describe, expect, it } from "vitest";
import rosa from "@/fixtures/kits/rosa.json";
import { KitSchema, MediaItemSchema, ProfileSchema } from "@/lib/types";

const profile = {
  suddenChange: false,
  supportLevel: "early",
  displayName: "Rosa",
  birthYear: 1942,
  hometown: "Chicago",
  favorites: [{ text: "Frank Sinatra", kind: "artist" }],
  thingsToAvoid: ["none"],
};

const media = {
  source: "qloo",
  qlooId: "abc",
  kind: "artist",
  title: "Ella Fitzgerald",
  whyPicked: "Qloo affinity",
  searchUrl: "https://open.spotify.com/search/Ella%20Fitzgerald",
};

describe("ProfileSchema", () => {
  it("accepts a valid profile", () => {
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("requires things to avoid (the caregiver must answer, even with 'none')", () => {
    expect(ProfileSchema.safeParse({ ...profile, thingsToAvoid: [] }).success).toBe(false);
  });

  it("allows 1–3 favorites only", () => {
    expect(ProfileSchema.safeParse({ ...profile, favorites: [] }).success).toBe(false);
    const four = Array(4).fill({ text: "x", kind: "other" });
    expect(ProfileSchema.safeParse({ ...profile, favorites: four }).success).toBe(false);
  });

  it("treats blank optional details as not given, and limits their length", () => {
    const parsed = ProfileSchema.parse({ ...profile, formerWork: "  ", traditions: "Sunday hymns" });
    expect(parsed.formerWork).toBeUndefined();
    expect(parsed.traditions).toBe("Sunday hymns");
    expect(ProfileSchema.safeParse({ ...profile, formerWork: "x".repeat(81) }).success).toBe(false);
  });

  it("rejects an unknown support level", () => {
    expect(ProfileSchema.safeParse({ ...profile, supportLevel: "severe" }).success).toBe(false);
  });

  it("rejects implausible birth years", () => {
    expect(ProfileSchema.safeParse({ ...profile, birthYear: 1850 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...profile, birthYear: 2015 }).success).toBe(false);
  });
});

describe("MediaItemSchema", () => {
  it("requires a Qloo ID for Qloo items (grounding)", () => {
    expect(MediaItemSchema.safeParse({ ...media, qlooId: undefined }).success).toBe(false);
  });

  it("lets LLM-only items go without a Qloo ID", () => {
    expect(MediaItemSchema.safeParse({ ...media, source: "llm", qlooId: undefined }).success).toBe(true);
  });

  it("only allows YouTube/Spotify search links, never embeds or other hosts", () => {
    for (const searchUrl of [
      "https://www.youtube.com/embed/abc",
      "https://example.com/?q=ella",
      "http://open.spotify.com/search/ella",
    ]) {
      expect(MediaItemSchema.safeParse({ ...media, searchUrl }).success).toBe(false);
    }
  });
});

describe("KitSchema sections", () => {
  const kit = KitSchema.parse(rosa);

  it("rejects an 'ok' section with no items", () => {
    expect(KitSchema.safeParse({ ...kit, dish: { status: "ok", items: [] } }).success).toBe(false);
  });

  it("requires a reason for a gap (D6: show the gap, never invent)", () => {
    expect(KitSchema.safeParse({ ...kit, dish: { status: "gap", items: [] } }).success).toBe(false);
    expect(
      KitSchema.safeParse({ ...kit, dish: { status: "gap", items: [], gapReason: "Qloo returned no dishes" } }).success,
    ).toBe(true);
  });
});
