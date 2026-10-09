// Phase 0: can Qloo return era-appropriate picks from one remembered favorite?
//
// Run:  node --env-file=.env.local scripts/phase0-era-test.mjs
// Out:  scripts/out/report.md (human review) + scripts/out/raw/*.json (every response)
//
// For each fictional persona we:
//   1. resolve their remembered favorite to a Qloo entity ID (/search)
//   2. ask /v2/insights for artists, movies, TV and places, seeded by that entity
//   3. run the same artist query WITHOUT the seed (control), to prove the seed drives the picks
// Movies/TV have release-year data, so we score them automatically. Artists don't,
// so they go into the report for a human to judge.

import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://hackathon.api.qloo.com";
const KEY = process.env.QLOO_API_KEY;
if (!KEY) {
  console.error("QLOO_API_KEY missing. Put it in .env.local and run with --env-file=.env.local");
  process.exit(1);
}

// Fictional personas. "Formative years" = ages 10–30, when reminiscence bumps peak.
const PERSONAS = [
  { name: "Rosa", born: 1942, hometown: "Chicago", favorite: "Frank Sinatra", favoriteType: "urn:entity:artist" },
  { name: "Walt", born: 1950, hometown: "Memphis", favorite: "Elvis Presley", favoriteType: "urn:entity:artist" },
  { name: "June", born: 1958, hometown: "Los Angeles", favorite: "The Sound of Music", favoriteType: "urn:entity:movie" },
];

const OUT = new URL("./out/", import.meta.url);
const RAW = new URL("./out/raw/", import.meta.url);
await mkdir(RAW, { recursive: true });

let callCount = 0;
async function qloo(path, params, label) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  callCount++;
  const res = await fetch(url, { headers: { "X-Api-Key": KEY, accept: "application/json" } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { nonJson: text.slice(0, 500) }; }
  await writeFile(new URL(`${label}.json`, RAW), JSON.stringify({ url: url.pathname + url.search, status: res.status, body }, null, 2));
  // Never log the key; the URL has no secrets because the key travels in a header.
  if (!res.ok) return { ok: false, status: res.status, error: body, url: url.pathname + url.search };
  return { ok: true, body };
}

const entitiesOf = (body) => body?.results?.entities ?? body?.results ?? [];

function yearOf(e) {
  const p = e.properties ?? {};
  const y = p.release_year ?? p.release_date ?? p.year;
  const n = parseInt(String(y ?? "").slice(0, 4), 10);
  return Number.isFinite(n) ? n : null;
}

function eraScore(entities, lo, hi) {
  const years = entities.map(yearOf).filter((y) => y !== null);
  if (!years.length) return { inEra: 0, withYear: 0, pct: null };
  const inEra = years.filter((y) => y >= lo && y <= hi).length;
  return { inEra, withYear: years.length, pct: Math.round((100 * inEra) / years.length) };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const lines = ["# Phase 0 — Qloo era-matching test", "", `Run: ${new Date().toISOString()}`, ""];
const summary = [];

for (const p of PERSONAS) {
  const lo = p.born + 10, hi = p.born + 30;
  const tag = slug(p.name);
  lines.push(`## ${p.name} — born ${p.born}, ${p.hometown}, favorite: ${p.favorite}`, `Formative window: ${lo}–${hi}`, "");

  // 1. Resolve the favorite to an entity ID
  const s = await qloo("/search", { query: p.favorite, types: p.favoriteType, take: 3 }, `${tag}-search`);
  const hit = s.ok ? entitiesOf(s.body)[0] : null;
  if (!hit) {
    lines.push(`**/search failed** (${s.status ?? "no results"}) — see raw/${tag}-search.json`, "");
    summary.push({ persona: p.name, error: "search failed" });
    continue;
  }
  const seed = hit.entity_id ?? hit.id;
  lines.push(`Seed: **${hit.name}** \`${seed}\``, "");

  const common = { "signal.interests.entities": seed, "signal.demographics.age": "55_and_older", take: 10 };
  const queries = [
    { key: "artists", params: { ...common, "filter.type": "urn:entity:artist" } },
    { key: "artists-NO-SEED", params: { "filter.type": "urn:entity:artist", "signal.demographics.age": "55_and_older", take: 10 } },
    { key: "movies-unfiltered", params: { ...common, "filter.type": "urn:entity:movie" } },
    { key: "movies-yearfilter", params: { ...common, "filter.type": "urn:entity:movie", "filter.release_year.min": lo, "filter.release_year.max": hi } },
    { key: "tv-yearfilter", params: { ...common, "filter.type": "urn:entity:tv_show", "filter.release_year.min": lo, "filter.release_year.max": hi } },
    { key: "places", params: { ...common, "filter.type": "urn:entity:place", "filter.location.query": p.hometown } },
  ];

  const row = { persona: p.name };
  for (const q of queries) {
    const r = await qloo("/v2/insights", q.params, `${tag}-${q.key}`);
    lines.push(`### ${q.key}`);
    if (!r.ok) {
      lines.push(`**FAILED ${r.status}** \`${r.url}\``, "```", JSON.stringify(r.error).slice(0, 400), "```", "");
      row[q.key] = `ERR ${r.status}`;
      continue;
    }
    const ents = entitiesOf(r.body);
    if (q.key.startsWith("movies") || q.key.startsWith("tv")) {
      const sc = eraScore(ents, lo, hi);
      row[q.key] = sc.pct === null ? "no years" : `${sc.pct}% (${sc.inEra}/${sc.withYear})`;
      lines.push(`Era score: ${row[q.key]}`);
    } else {
      row[q.key] = `${ents.length} results`;
    }
    lines.push("", ...ents.map((e) => `- ${e.name}${yearOf(e) ? ` (${yearOf(e)})` : ""}`), "");
  }
  summary.push(row);
}

const cols = ["persona", "artists", "artists-NO-SEED", "movies-unfiltered", "movies-yearfilter", "tv-yearfilter", "places"];
const table = [
  `| ${cols.join(" | ")} |`,
  `| ${cols.map(() => "---").join(" | ")} |`,
  ...summary.map((r) => `| ${cols.map((c) => r[c] ?? r.error ?? "").join(" | ")} |`),
];
lines.splice(4, 0, "## Summary", "", ...table, "", `API calls: ${callCount}`, "",
  "**Human check:** are the seeded artists from the right decades? Do they differ from the NO-SEED control?", "");

await writeFile(new URL("report.md", OUT), lines.join("\n"));
console.log(table.join("\n"));
console.log(`\n${callCount} calls. Full report: scripts/out/report.md`);
