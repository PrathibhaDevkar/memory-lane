// Builds fixtures/kits/rosa.json, the walking-skeleton kit, from the saved Phase 0 Qloo responses.
//
// Run:  node scripts/build-fixture-kit.mjs
// In:   scripts/out/raw/rosa-*.json (written by scripts/phase0-era-test.mjs; gitignored)
// Out:  fixtures/kits/rosa.json (committed)
//
// Picks are chosen by Qloo ID and the script fails if an ID isn't in the real response,
// so every item in the fixture is grounded in Qloo data, the same rule the agent follows.
// The trace replays the Oct 8 calls and the D3/D4 rules as the pipeline will apply them;
// hand-made choices are labeled as such. ms is 0 because Phase 0 did not time calls.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const RAW = new URL("./out/raw/", import.meta.url);
const OUT = new URL("../fixtures/kits/", import.meta.url);
const PHASE0_RUN = "2026-10-08";

const youtube = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const spotify = (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;

async function load(name) {
  const r = JSON.parse(await readFile(new URL(`${name}.json`, RAW), "utf8"));
  return { url: r.url, entities: r.body.results.entities };
}

function pick(resp, id) {
  const e = resp.entities.find((x) => x.entity_id === id);
  if (!e) throw new Error(`Qloo ID ${id} not found in ${resp.url}. Fixture would not be grounded.`);
  return e;
}

const artists = await load("rosa-artists");
const movies = await load("rosa-movies-yearfilter");
const tv = await load("rosa-tv-yearfilter");
const places = await load("rosa-places");

const SEED = "Frank Sinatra";
const artist = (id) => {
  const e = pick(artists, id);
  return {
    source: "qloo", qlooId: id, kind: "artist", title: e.name,
    whyPicked: `Qloo: people who love ${SEED} also love ${e.name}.`,
    searchUrl: spotify(e.name),
  };
};
const screen = (resp, id, kind) => {
  const e = pick(resp, id);
  const year = e.properties.release_year;
  return {
    source: "qloo", qlooId: id, kind, title: e.name, year,
    whyPicked: `Qloo: a ${kind === "tv" ? "show" : "film"} from ${year} that ${SEED} fans also enjoy.`,
    searchUrl: youtube(`${e.name} ${year} ${kind === "tv" ? "opening" : "trailer"}`),
  };
};

const giordanos = pick(places, "7662737C-2A63-4DC5-BA74-5B46E0F38C2A");
const deepDish = giordanos.properties.specialty_dishes.find((d) => d.id === "urn:tag:specialty_dish:place:chicago_style_pizza");
if (!deepDish) throw new Error("chicago_style_pizza tag missing from Giordano's");
const maxwell = pick(places, "49BECC83-406C-446B-A460-C64579EFB2B0");

// Same rule get_places will apply (docs/plan.md §7.1, D4).
const LANDMARK = /:(historical_landmark|heritage_building|market|sculpture|park|[a-z_]*museum)$/;
const genreOf = (e) => e.properties.primary_genre?.id ?? "no genre";
const keptPlaces = places.entities.filter((e) => LANDMARK.test(genreOf(e)));
const droppedPlaces = places.entities.filter((e) => !LANDMARK.test(genreOf(e)));

const kit = {
  mode: "memory_lane",
  provenance: {
    kind: "fixture",
    generatedAt: PHASE0_RUN,
    note: "A saved sample kit for Rosa, built from real Qloo results saved on Oct 8.",
  },
  profile: {
    suddenChange: false,
    displayName: "Rosa",
    supportLevel: "early",
    birthYear: 1942,
    hometown: "Chicago",
    favorites: [{ text: SEED, kind: "artist" }],
    thingsToAvoid: ["none"],
  },
  era: { start: 1952, end: 1972 },
  music: {
    status: "ok",
    items: [
      "C9A0AD41-7EDF-4C3E-A816-D1E73A17605E", // Ella Fitzgerald
      "E0CD9B0B-75BB-4DAE-BCB7-79AB5DE42A0D", // Nat King Cole
      "78991296-9E4A-4559-996A-5C5B5DCB8374", // Louis Armstrong
      "3F144530-744A-421D-A425-5AF95DD55F4F", // Peggy Lee
      "15D12B84-FEC9-4049-B783-BAC121CA4904", // Tony Bennett
    ].map(artist),
  },
  screen: {
    status: "ok",
    items: [
      screen(movies, "3DD33BA9-A183-4931-A5C9-4629C2F3CBDD", "movie"), // Designing Woman (1957)
      screen(movies, "09CF9AA5-02BD-4035-9D65-4773181AA633", "movie"), // Sweet Charity (1969)
      screen(tv, "5FD46A30-6F82-40CE-8DBA-DF86DF33F0B8", "tv"), // Route 66 (1960)
    ],
  },
  dish: {
    status: "ok",
    items: [{
      source: "qloo",
      name: "Chicago-style deep-dish pizza",
      qlooTagId: deepDish.id,
      // No fromPlace: Giordano's opened in 1974, after Rosa's 1952–1972 window.
      caveat: "Something to talk about, not to serve. Check diet, chewing and swallowing needs before offering any food.",
    }],
  },
  place: {
    status: "ok",
    items: [{
      source: "qloo",
      qlooId: maxwell.entity_id,
      name: maxwell.name,
      genre: maxwell.properties.primary_genre.id,
      whyPicked: `Qloo: a Chicago place popular with people who love ${SEED}. A place to talk about, not a visit suggestion.`,
    }],
  },
  activityIdeas: [],
  prompts: [
    "What music did people dance to when you were young?",
    "Which singer's voice do you like best, and what do you like about it?",
    "What was it like going to the movies back then?",
    "What foods remind you of Chicago?",
    "Tell me about a market or a busy street you liked to visit.",
  ],
  trace: [
    {
      id: "t1", kind: "tool", label: "resolve_favorite", input: { query: SEED, types: "urn:entity:artist" },
      outputSummary: `${SEED} → FC0F8D26-BA80-4D83-8BBF-FC011DC8D241`, excluded: [], ms: 0, status: "ok",
    },
    {
      id: "t2", kind: "tool", label: "get_music", input: { seed: SEED },
      outputSummary: `${artists.entities.length} artists returned.`, excluded: [], ms: 0, status: "ok",
    },
    {
      id: "t3", kind: "tool", label: "get_screen(movie)", input: { seed: SEED, "filter.release_year": "1952–1972" },
      outputSummary: `${movies.entities.length} films returned, all in era.`, excluded: [], ms: 0, status: "ok",
    },
    {
      id: "t4", kind: "filter", label: "content filter (D3)", input: { list: "movies" },
      outputSummary: "2 films excluded before Claude sees them.",
      excluded: [
        { title: "Last Tango in Paris (1972)", reason: "Mature content: rated NC-17." },
        { title: "Charly (1968)", reason: "Sensitive theme: memory decline." },
      ],
      ms: 0, status: "ok",
    },
    {
      id: "t5", kind: "tool", label: "get_places", input: { seed: SEED, location: "Chicago" },
      outputSummary: `${places.entities.length} places returned; ${keptPlaces.length} pass the landmark allowlist (D4).`,
      excluded: droppedPlaces.map((e) => ({ title: e.name, reason: `Not a landmark (${genreOf(e)}).` })),
      ms: 0, status: "ok",
    },
    {
      id: "t6", kind: "validator", label: "hand-picked for this sample (no Claude call)", input: {},
      outputSummary: "Picks above were chosen by hand for this fixture. Maxwell Street Market over Cloud Gate, which was built in 2006, after Rosa's era. The dish is shown without its restaurant: Giordano's opened in 1974, also after her era. In live runs, Claude makes these choices.",
      excluded: [], ms: 0, status: "ok",
    },
  ],
};

await mkdir(OUT, { recursive: true });
await writeFile(new URL("rosa.json", OUT), JSON.stringify(kit, null, 2) + "\n");
console.log("Wrote fixtures/kits/rosa.json");
