import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avoidMatch, avoidPhrases, cleanDishes, contentConcern, landmarks, screen } from "@/lib/qloo/filters";
import type { QlooEntity } from "@/lib/qloo/types";

// Real Qloo responses: the Oct 14 re-check plus the Phase 0 offenders.
const load = (path: string): QlooEntity[] => JSON.parse(readFileSync(path, "utf8")).entities;
const dirs = ["fixtures/qloo", "fixtures/qloo/phase0"];
const media = dirs.flatMap((d) =>
  readdirSync(d)
    .filter((f) => /(movies|tv)/.test(f))
    .flatMap((f) => load(`${d}/${f}`)),
);
const byName = (name: string) => {
  const e = media.find((m) => m.name === name);
  if (!e) throw new Error(`${name} not in fixtures`);
  return e;
};

describe("contentConcern (D3)", () => {
  it.each([
    ["Still Alice", /cognitive decline/],
    ["Charly", /memory decline/],
    ["Holocaust", /War/],
    ["Last Tango in Paris", /NC-17/],
    ["Terms of Endearment", /grief/],
    ["Hitler: A Career", /totalitarian/],
    ["A Clockwork Orange", /rated R/],
    ["The Rolling Stones: Cocksucker Blues", /drug use/],
  ])("excludes %s", (name, reason) => {
    expect(contentConcern(byName(name))).toMatch(reason);
  });

  // Keyword tags would have dropped these (e.g. The Sound of Music is tagged "Nazi").
  it.each(["The Sound of Music", "The Princess Bride", "Mary Poppins", "Kramer vs. Kramer", "Willy Wonka & the Chocolate Factory", "Grease"])(
    "keeps %s",
    (name) => {
      expect(contentConcern(byName(name))).toBeNull();
    },
  );

  it("matches sensitive themes at the start of a word only", () => {
    const about = (plot_themes_description: string): QlooEntity => ({ ...byName("Mary Poppins"), properties: { plot_themes_description } });
    expect(contentConcern(about("A therapeutic friendship between skyscraper window washers and grape pickers."))).toBeNull();
    expect(contentConcern(about("A widow's grief in a small town."))).toMatch(/grief/);
  });

  it("leaves most of each era list intact", () => {
    for (const f of ["rosa-movies", "walt-movies", "june-movies"]) {
      const list = load(`fixtures/qloo/${f}.json`);
      const kept = list.filter((e) => !contentConcern(e));
      expect(kept.length / list.length).toBeGreaterThan(0.6);
    }
  });
});

describe("avoidMatch (caregiver's list)", () => {
  const kramer = byName("Kramer vs. Kramer"); // has a "Hospital" keyword

  it("matches singular and plural", () => {
    expect(avoidMatch(kramer, ["hospitals"])).toBe("hospitals");
    expect(avoidMatch(kramer, ["Hospital"])).toBe("Hospital");
  });

  it("ignores 'none' and blank entries", () => {
    expect(avoidMatch(kramer, ["none"])).toBeNull();
    expect(avoidMatch(kramer, ["  "])).toBeNull();
  });

  it("matches whole words only", () => {
    expect(avoidMatch({ ...kramer, keywords: ["Warehouse"] , genres: [], name: "X", properties: {} }, ["war"])).toBeNull();
  });

  const named = (name: string): QlooEntity => ({ ...kramer, name, keywords: [], genres: [], properties: {} });

  it("matches plurals ending in -es, such as horses, nurses and graves", () => {
    expect(avoidMatch(named("The Horse Soldiers"), ["horses"])).toBe("horses");
    expect(avoidMatch(named("Nurse Betty"), ["nurses"])).toBe("nurses");
    expect(avoidMatch(named("The Grave"), ["graves"])).toBe("graves");
    expect(avoidMatch(named("Battle Cry"), ["battles"])).toBe("battles");
    expect(avoidMatch(named("Church Bells"), ["churches"])).toBe("churches");
  });

  it("matches the topic of a description, not only the whole line", () => {
    expect(avoidMatch(kramer, ["anything about hospitals"])).toBe("anything about hospitals");
    expect(avoidMatch(named("Mother"), ["songs about my mother"])).toBe("songs about my mother");
    expect(avoidMatch(named("War and Peace"), ["war films"])).toBe("war films");
    expect(avoidMatch(named("Moon River"), ["songs about the sea"])).toBeNull();
  });

  it("matches each part of a list typed on one line, and a title with a comma as a whole", () => {
    expect(avoidMatch(kramer, ["funerals, hospitals"])).toBe("funerals, hospitals");
    expect(avoidMatch(named("Hello, Dolly!"), ["Hello, Dolly!"])).toBe("Hello, Dolly!");
  });

  it("treats answers like 'Nothing' or 'n/a' as no entry", () => {
    expect(avoidPhrases("Nothing")).toEqual([]);
    expect(avoidPhrases("n/a")).toEqual([]);
    expect(avoidMatch(named("Much Ado About Nothing"), ["Nothing"])).toBeNull();
  });

  it("screen() puts the caregiver's reason first and keeps the rest", () => {
    const { kept, excluded } = screen([kramer, byName("Mary Poppins")], ["hospitals"], { content: true });
    expect(kept.map((e) => e.name)).toEqual(["Mary Poppins"]);
    expect(excluded[0]).toEqual({ title: "Kramer vs. Kramer (1979)", reason: "On the caregiver's avoid list: hospitals." });
  });
});

describe("landmarks (D4)", () => {
  it("finds landmarks for all three cities, historic places first", () => {
    for (const who of ["rosa", "walt", "june"]) {
      expect(landmarks(load(`fixtures/qloo/${who}-places.json`)).length).toBeGreaterThan(0);
    }
    const june = landmarks(load("fixtures/qloo/june-places.json")).map((e) => e.name);
    expect(june.slice(0, 2).sort()).toEqual(["Hollywood Sign", "Spadena House"]);
  });

  it("ranks market and sculpture above museums (Rosa)", () => {
    const rosa = landmarks(load("fixtures/qloo/rosa-places.json")).map((e) => e.name);
    expect(rosa.indexOf("Cloud Gate")).toBeLessThan(rosa.indexOf("Museum of Illusions Chicago"));
  });

  it("drops water parks and rides", () => {
    const e = { entity_id: "x", name: "Splash", properties: { primary_genre: "urn:tag:genre:place:water_park" }, genres: [], keywords: [] };
    expect(landmarks([e])).toEqual([]);
  });
});

describe("cleanDishes", () => {
  it("drops numbered and house-named entries, keeps real dishes", () => {
    const giordanos = load("fixtures/qloo/rosa-restaurants.json").find((e) => e.name === "Giordano's")!;
    const slugs = cleanDishes(giordanos).map((d) => d.slug);
    expect(slugs).toContain("chicago_style_pizza");
    expect(slugs).not.toContain("giordano_s_house_salad");
    const ribs = { entity_id: "x", name: "Bar", properties: { specialty_dishes: [{ id: "urn:tag:specialty_dish:place:1_2_rack_ribs", name: "1 2 Rack Of Ribs" }] }, genres: [], keywords: [] };
    expect(cleanDishes(ribs)).toEqual([]);
  });

  it("keeps generic dishes at places named after a food", () => {
    const hut = { entity_id: "x", name: "Pizza Hut", properties: { specialty_dishes: [{ id: "urn:tag:specialty_dish:place:pizza_margherita", name: "Pizza Margherita" }] }, genres: [], keywords: [] };
    expect(cleanDishes(hut).map((d) => d.slug)).toEqual(["pizza_margherita"]);
  });
});
