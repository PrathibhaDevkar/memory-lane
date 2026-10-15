// Phase 2, task 2.0: re-check Qloo with the call shapes Phase 2 will actually use, before writing the tools.
//
// Run:  node --env-file=.env.local scripts/qloo-recheck.mjs
//       node scripts/qloo-recheck.mjs --phase0-only   (no API calls: re-trims the Phase 0 offender fixtures)
//       node scripts/qloo-recheck.mjs --retrim        (no API calls: re-trims everything from scripts/out/)
// Out:  scripts/out/recheck/*.json   full responses (gitignored, for debugging)
//       fixtures/qloo/*.json         trimmed responses for tests (committed)
//       scripts/out/recheck/report.md  findings (gitignored; summarized in docs/research.md §2)
//
// What changed since Phase 0 (docs/research.md §2):
//   - no signal.demographics.age (D7)
//   - take=25 for media, take=50 for places, so filters have room to drop items
//   - places and restaurants are separate calls (get_places / get_dish)
//   - the modern-favorite hop: Taylor Swift → year-filtered films → music seeded by the top film
//
// Questions it answers (task 2.0 "done when"):
//   1. Does June (Los Angeles) get at least one landmark place?
//   2. Does June get a specialty dish, or do we accept a gap?
//   3. Does the hop return in-era films?
//   4. Does Charly (1968) still come back for Rosa without the age signal? (demo step 6)

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const BASE = "https://hackathon.api.qloo.com";
const KEY = process.env.QLOO_API_KEY;
const OFFLINE = process.argv.includes("--phase0-only") || process.argv.includes("--retrim");
if (!KEY && !OFFLINE) {
  console.error("QLOO_API_KEY missing. Run with --env-file=.env.local");
  process.exit(1);
}

const RAW = new URL("./out/recheck/", import.meta.url);
const FIX = new URL("../fixtures/qloo/", import.meta.url);
const DOC = new URL("./out/recheck/report.md", import.meta.url);
await mkdir(RAW, { recursive: true });
await mkdir(FIX, { recursive: true });

// Phase 0 responses that contain the known offenders (Still Alice, Charly, Last Tango in Paris,
// the explicit Rolling Stones documentary, Holocaust, Terms of Endearment) plus titles that must
// be kept (Kramer vs. Kramer). Committed trimmed, so filter tests don't depend on what Qloo
// returns today. Source: scripts/out/raw/ from scripts/phase0-era-test.mjs (Oct 8).
const PHASE0_OFFENDERS = [
  "rosa-movies-unfiltered",
  "rosa-movies-yearfilter",
  "walt-movies-yearfilter",
  "june-movies-yearfilter",
  "june-tv-yearfilter",
];
async function copyPhase0() {
  const dir = new URL("phase0/", FIX);
  await mkdir(dir, { recursive: true });
  for (const name of PHASE0_OFFENDERS) {
    const raw = JSON.parse(await readFile(new URL(`./out/raw/${name}.json`, import.meta.url), "utf8"));
    await writeFixture(new URL(`${name}.json`, dir), name, raw);
  }
  console.log(`Copied ${PHASE0_OFFENDERS.length} Phase 0 responses to fixtures/qloo/phase0/`);
}

const PERSONAS = [
  { name: "Rosa", born: 1942, hometown: "Chicago", favorite: "Frank Sinatra", type: "urn:entity:artist" },
  { name: "Walt", born: 1950, hometown: "Memphis", favorite: "Elvis Presley", type: "urn:entity:artist" },
  { name: "June", born: 1958, hometown: "Los Angeles", favorite: "The Sound of Music", type: "urn:entity:movie" },
];

// Same rules the tools apply (docs/plan.md §7.1 D4, §8 D3). Kept here only to
// report on the data; the tested versions live in lib/qloo/filters.ts (task 2.1).
const LANDMARK = /:(historical_landmark|heritage_building|market|sculpture|park|[a-z_]*museum)$/;
const NOT_LANDMARK = /:(water_park|amusement_park_ride)$/;
const isLandmark = (genreId) => Boolean(genreId) && LANDMARK.test(genreId) && !NOT_LANDMARK.test(genreId);

let calls = 0;
const failures = [];

async function qloo(path, params, label) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  calls++;
  const started = Date.now();
  const res = await fetch(url, { headers: { "X-Api-Key": KEY, accept: "application/json" } });
  const ms = Date.now() - started;
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { nonJson: text.slice(0, 500) };
  }
  // The key travels in a header, so the URL is safe to store.
  const where = url.pathname + url.search;
  await writeFile(new URL(`${label}.json`, RAW), JSON.stringify({ url: where, status: res.status, ms, body }, null, 2));
  // /search returns results as a plain list; /v2/insights nests them under results.entities.
  const entities = entitiesOf(body);
  await writeFixture(new URL(`${label}.json`, FIX), label, { url: where, status: res.status, body });
  if (!res.ok) failures.push({ label, status: res.status, error: JSON.stringify(body).slice(0, 300) });
  return { ok: res.ok, status: res.status, ms, entities };
}

// The fields Memory Lane reads, in the normalized shape lib/qloo/client.ts (task 2.2) will produce.
// Tags become two name lists: genres (the D3 war check) and keywords (the caregiver's avoid-list).
// Qloo's style, ambience, decor and amenity tags are most of the payload and unused.
function trim(e) {
  const p = e.properties ?? {};
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] != null).map((k) => [k, o[k]]));
  const tagNames = (re) => [...new Set((e.tags ?? []).filter((t) => re.test(t.type ?? "")).map((t) => t.name))];
  return {
    entity_id: e.entity_id,
    name: e.name,
    type: e.type,
    properties: {
      ...pick(p, ["release_year", "content_rating", "plot_themes_description", "description", "short_description"]),
      ...(p.primary_genre ? { primary_genre: p.primary_genre.id } : {}),
      ...(p.specialty_dishes ? { specialty_dishes: p.specialty_dishes.map((d) => ({ id: d.id, name: d.name })) } : {}),
    },
    genres: tagNames(/^urn:tag:genre/),
    keywords: [...new Set([...tagNames(/^urn:tag:keyword/), ...(p.keywords ?? []).map(String)])],
  };
}

const entitiesOf = (body) => (Array.isArray(body?.results) ? body.results : (body?.results?.entities ?? []));
const writeFixture = (url, label, r) =>
  writeFile(url, JSON.stringify({ url: r.url, status: r.status, entities: entitiesOf(r.body).map(trim) }, null, 2) + "\n");

// Re-trim committed fixtures from the full local copies, without calling Qloo.
if (process.argv.includes("--retrim")) {
  for (const f of await readdir(RAW)) {
    if (!f.endsWith(".json")) continue;
    await writeFixture(new URL(f, FIX), f, JSON.parse(await readFile(new URL(f, RAW), "utf8")));
  }
  await copyPhase0();
  process.exit(0);
}

if (process.argv.includes("--phase0-only")) {
  await copyPhase0();
  process.exit(0);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const yearOf = (e) => e.properties?.release_year ?? null;
const inWindow = (ents, lo, hi) => {
  const ys = ents.map(yearOf).filter((y) => y != null);
  return { inEra: ys.filter((y) => y >= lo && y <= hi).length, withYear: ys.length };
};

const lines = [
  "# Phase 2 re-check of Qloo (task 2.0)",
  "",
  `Run: ${new Date().toISOString().slice(0, 10)} · script: scripts/qloo-recheck.mjs · trimmed responses: fixtures/qloo/`,
  "",
  "Same personas as Phase 0, with the call shapes Phase 2 uses: no age signal (D7), `take=25` for media, `take=50` for places, separate places and restaurants calls.",
  "",
  "Generated on each run. The curated summary and the decisions drawn from it are in docs/research.md and docs/plan.md.",
  "",
];
const answers = {};

async function seedFor(p, tag) {
  const s = await qloo("/search", { query: p.favorite, types: p.type, take: 3 }, `${tag}-search`);
  const hit = s.entities[0];
  return hit ? { id: hit.entity_id, name: hit.name } : null;
}

for (const p of PERSONAS) {
  const tag = slug(p.name);
  const lo = p.born + 10;
  const hi = p.born + 30;
  lines.push(`## ${p.name}: born ${p.born}, ${p.hometown}, favorite ${p.favorite} (window ${lo}–${hi})`, "");

  const seed = await seedFor(p, tag);
  if (!seed) {
    lines.push("**Search failed. No seed.**", "");
    continue;
  }
  lines.push(`Seed: **${seed.name}** \`${seed.id}\``, "");
  const common = { "signal.interests.entities": seed.id };

  const artists = await qloo("/v2/insights", { ...common, "filter.type": "urn:entity:artist", take: 25 }, `${tag}-artists`);
  const movies = await qloo(
    "/v2/insights",
    { ...common, "filter.type": "urn:entity:movie", "filter.release_year.min": lo, "filter.release_year.max": hi, take: 25 },
    `${tag}-movies`,
  );
  const tv = await qloo(
    "/v2/insights",
    { ...common, "filter.type": "urn:entity:tv_show", "filter.release_year.min": lo, "filter.release_year.max": hi, take: 25 },
    `${tag}-tv`,
  );
  const places = await qloo(
    "/v2/insights",
    { ...common, "filter.type": "urn:entity:place", "filter.location.query": p.hometown, take: 50 },
    `${tag}-places`,
  );
  const restaurants = await qloo(
    "/v2/insights",
    {
      ...common,
      "filter.type": "urn:entity:place",
      "filter.location.query": p.hometown,
      "filter.tags": "urn:tag:genre:place:restaurant",
      take: 50,
    },
    `${tag}-restaurants`,
  );

  const m = inWindow(movies.entities, lo, hi);
  const t = inWindow(tv.entities, lo, hi);
  const landmarks = places.entities.filter((e) => isLandmark(e.properties?.primary_genre?.id));
  const withDish = (ents) => ents.filter((e) => e.properties?.specialty_dishes?.length);
  const dishPlaces = withDish(restaurants.entities);
  const dishPlacesFromPlaces = withDish(places.entities);

  lines.push(
    "| Call | Status | Results | Notes |",
    "|---|---|---|---|",
    `| artists | ${artists.status} | ${artists.entities.length} | ${artists.entities.slice(0, 8).map((e) => e.name).join(", ")} |`,
    `| movies (year filter) | ${movies.status} | ${movies.entities.length} | ${m.inEra}/${m.withYear} in era |`,
    `| tv (year filter) | ${tv.status} | ${tv.entities.length} | ${t.inEra}/${t.withYear} in era |`,
    `| places, take 50 | ${places.status} | ${places.entities.length} | ${landmarks.length} pass the landmark allowlist: ${landmarks.map((e) => `${e.name} (${e.properties.primary_genre.id.split(":").pop()})`).join(", ") || "none"} |`,
    `| restaurants, take 50 | ${restaurants.status} | ${restaurants.entities.length} | ${dishPlaces.length} list specialty dishes${dishPlaces.length ? ": " + dishPlaces.slice(0, 5).map((e) => `${e.name} (${e.properties.specialty_dishes.slice(0, 2).map((d) => d.id.split(":").pop()).join(", ")})`).join("; ") : ""} |`,
    "",
  );
  if (p.name === "June") {
    answers.juneLandmarks = landmarks.map((e) => e.name);
    answers.juneDishPlaces = dishPlaces.map((e) => e.name);
    answers.juneDishFromPlacesCall = dishPlacesFromPlaces.map((e) => e.name);
    answers.restaurantsFilterWorked = restaurants.ok && restaurants.entities.every((e) => /restaurant|bar|cafe|food|bakery|coffee/.test(e.properties?.primary_genre?.id ?? ""));
  }
  if (p.name === "Rosa") {
    answers.charly = movies.entities.find((e) => /^Charly$/i.test(e.name));
    answers.rosaMovieNames = movies.entities.map((e) => `${e.name} (${yearOf(e)})`);
  }
  lines.push(`Movies: ${movies.entities.map((e) => `${e.name} (${yearOf(e)}, ${e.properties?.content_rating ?? "no rating"})`).join("; ")}`, "");
}

// The modern-favorite hop (D2): a 1942-born person whose only favorite is Taylor Swift.
{
  const lo = 1952;
  const hi = 1972;
  lines.push("## Modern-favorite hop: born 1942, favorite Taylor Swift (window 1952–1972)", "");
  const seed = await seedFor({ favorite: "Taylor Swift", type: "urn:entity:artist" }, "hop");
  if (seed) {
    const direct = await qloo("/v2/insights", { "signal.interests.entities": seed.id, "filter.type": "urn:entity:artist", take: 10 }, "hop-artists-direct");
    const films = await qloo(
      "/v2/insights",
      { "signal.interests.entities": seed.id, "filter.type": "urn:entity:movie", "filter.release_year.min": lo, "filter.release_year.max": hi, take: 25 },
      "hop-movies",
    );
    const f = inWindow(films.entities, lo, hi);
    const top = films.entities[0];
    let viaFilm = { entities: [] };
    if (top) {
      viaFilm = await qloo(
        "/v2/insights",
        { "signal.interests.entities": top.entity_id, "filter.type": "urn:entity:artist", take: 10 },
        "hop-artists-via-film",
      );
    }
    answers.hop = { inEra: f.inEra, withYear: f.withYear, top: top && `${top.name} (${yearOf(top)})` };
    lines.push(
      `Seed: **${seed.name}**`,
      "",
      `- Music seeded by Taylor Swift directly: ${direct.entities.map((e) => e.name).join(", ")}`,
      `- Year-filtered films seeded by Taylor Swift: ${f.inEra}/${f.withYear} in era. Top: ${answers.hop.top ?? "none"}`,
      `- Music seeded by that top film: ${viaFilm.entities.map((e) => e.name).join(", ") || "none"}`,
      "",
    );
  }
}

lines.push("## Answers to task 2.0", "");
lines.push(
  `1. **June landmark place:** ${answers.juneLandmarks?.length ? `yes, ${answers.juneLandmarks.length}: ${answers.juneLandmarks.join(", ")}` : "**no**"}.`,
  `2. **June specialty dish:** ${answers.juneDishPlaces?.length ? `yes, from ${answers.juneDishPlaces.slice(0, 5).join(", ")}` : answers.juneDishFromPlacesCall?.length ? `only in the general places call: ${answers.juneDishFromPlacesCall.join(", ")}` : "**no.** The dish section will show a gap for June"}. Restaurant tag filter ${answers.restaurantsFilterWorked ? "returned only food places" : "did **not** return only food places (check the table)"}.`,
  `3. **Modern-favorite hop:** ${answers.hop ? `${answers.hop.inEra}/${answers.hop.withYear} films in era; top film ${answers.hop.top}` : "search failed"}.`,
  `4. **Charly for Rosa without the age signal:** ${answers.charly ? `still returned (${yearOf(answers.charly)}), so demo step 6 works as planned` : "**not returned.** Demo step 6 must use whichever title the trace excludes"}.`,
  "",
  `${calls} Qloo calls, ${failures.length} failed.`,
);
if (failures.length) {
  lines.push("", "### Failures", "", ...failures.map((f) => `- \`${f.label}\`: ${f.status} \`${f.error}\``));
}

await writeFile(DOC, lines.join("\n") + "\n");
await copyPhase0();
console.log(lines.slice(lines.indexOf("## Answers to task 2.0")).join("\n"));
