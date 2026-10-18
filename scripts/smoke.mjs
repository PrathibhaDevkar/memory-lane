// End-to-end check: builds a kit for each persona through the running app and prints what came back.
//
// Run:  npm run dev:agent            (in another terminal; KIT_SOURCE=agent)
//       node scripts/smoke.mjs [base-url] [persona...] [--save]
// --save writes each live kit to fixtures/kits/<persona>.json, labeled as a saved run, for use
// as a demo (then add it to lib/demos.ts).
// Default base URL: http://localhost:3000. Personas: rosa walt june swift margaret okafor elena (default: all).
// With SMOKE_TOKEN set (npm run smoke reads .env.local), the run skips the live-kit limits.
// Each live kit prints its Claude token use and cost at list prices.

import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const SAVE = args.includes("--save");
const only = args.filter((a) => !a.startsWith("http") && !a.startsWith("--"));

const base = { suddenChange: false, supportLevel: "early", thingsToAvoid: ["none"] };
const PERSONAS = {
  rosa: { ...base, displayName: "Rosa", birthYear: 1942, hometown: "Chicago", favorites: [{ text: "Frank Sinatra", kind: "artist" }] },
  walt: { ...base, displayName: "Walt", birthYear: 1950, hometown: "Memphis", favorites: [{ text: "Elvis Presley", kind: "artist" }], thingsToAvoid: ["war films"] },
  june: { ...base, displayName: "June", birthYear: 1958, hometown: "Los Angeles", favorites: [{ text: "The Sound of Music", kind: "movie" }], thingsToAvoid: ["hospitals"] },
  // The modern-favorite hop (D2): music should still come from 1952–1972.
  swift: { ...base, displayName: "Rosa (modern favorite)", birthYear: 1942, hometown: "Chicago", favorites: [{ text: "Taylor Swift", kind: "artist" }] },
  // Must pass: a sudden change means no kit at all (D9).
  margaret: { ...base, suddenChange: true, displayName: "Margaret", birthYear: 1940, hometown: "Boston", favorites: [{ text: "Doris Day", kind: "artist" }] },
  // Middle level, former work drives the questions; may flag thin coverage honestly.
  okafor: { ...base, supportLevel: "middle", displayName: "Mr. Okafor", birthYear: 1946, hometown: "Lagos", favorites: [{ text: "Fela Kuti", kind: "artist" }], formerWork: "maths teacher", firstLanguage: "Yoruba" },
  // Late level: music first, few or no questions, hymns from traditions.
  elena: { ...base, supportLevel: "late", displayName: "Elena", birthYear: 1938, hometown: "Chicago", favorites: [{ text: "Perry Como", kind: "artist" }], traditions: "Catholic hymns" },
};

// US$ per million tokens, list prices on Oct 17, 2026: platform.claude.com/docs/en/about-claude/pricing
const PRICES = {
  "claude-opus-5-5": { in: 4, cacheWrite: 5, cacheRead: 0.2, out: 20 },
  "claude-sonnet-5-5": { in: 2, cacheWrite: 2.5, cacheRead: 0.1, out: 10 },
  "claude-haiku-5-5": { in: 0.1, cacheWrite: 0.125, cacheRead: 0.01, out: 0.5 },
};
const usd = (step) => {
  const price = Object.entries(PRICES).find(([model]) => String(step.input.model).startsWith(model))?.[1];
  const usage = step.input.usage;
  return price && usage ? Object.keys(price).reduce((n, k) => n + ((usage[k] ?? 0) * price[k]) / 1e6, 0) : NaN;
};
const headers = { "content-type": "application/json", ...(process.env.SMOKE_TOKEN ? { "x-smoke-token": process.env.SMOKE_TOKEN } : {}) };

let failures = 0;
for (const [key, profile] of Object.entries(PERSONAS)) {
  if (only.length && !only.includes(key)) continue;
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/kit`, { method: "POST", headers, body: JSON.stringify(profile) });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const kit = await res.json().catch(() => null);
  console.log(`\n=== ${profile.displayName}: born ${profile.birthYear}, ${profile.hometown}, favorite ${profile.favorites[0].text} (${secs}s, HTTP ${res.status})`);
  if (profile.suddenChange) {
    const ok = res.ok && kit?.mode === "safety_stop";
    console.log(ok ? "  safety stop, no kit (as expected)" : `  FAILED: expected a safety stop, got ${JSON.stringify(kit).slice(0, 200)}`);
    if (!ok) failures++;
    continue;
  }
  if (!res.ok || !kit?.music) {
    failures++;
    console.log("  FAILED:", JSON.stringify(kit).slice(0, 300));
    continue;
  }
  const show = (label, section, fmt) =>
    console.log(`  ${label.padEnd(8)} ${section.status === "ok" ? section.items.map(fmt).join(" | ") : `GAP: ${section.gapReason}`}`);
  console.log(`  era      ${kit.era.start}–${kit.era.end} · support: ${kit.profile.supportLevel} · source: ${kit.provenance.kind}`);
  show("music", kit.music, (i) => i.title);
  show("screen", kit.screen, (i) => `${i.title} (${i.year})`);
  show("dish", kit.dish, (i) => (i.fromPlace ? `${i.name} @ ${i.fromPlace}` : i.name));
  show("place", kit.place, (i) => i.name);
  console.log(`  prompts  ${kit.prompts.length}${kit.activityIdeas.length ? ` · ideas: ${kit.activityIdeas.map((i) => i.text).join(" | ")}` : ""}`);
  for (const p of kit.prompts) console.log(`           - ${p}`);
  const claude = kit.trace.filter((s) => s.kind === "llm");
  const tools = kit.trace.filter((s) => s.kind === "tool");
  const excluded = kit.trace.flatMap((s) => s.excluded);
  console.log(`  agent    ${claude.length} Claude turns, ${tools.length} tool calls, ${excluded.length} exclusions`);
  if (claude.length) {
    const used = (k) => claude.reduce((n, s) => n + (s.input.usage?.[k] ?? 0), 0);
    const cost = claude.reduce((n, s) => n + usd(s), 0);
    console.log(`  tokens   in ${used("in")} · cache write ${used("cacheWrite")} · cache read ${used("cacheRead")} · out ${used("out")} · ${Number.isNaN(cost) ? "cost unknown for this model" : `$${cost.toFixed(3)}`}`);
  }
  for (const s of kit.trace) console.log(`           ${s.kind.padEnd(9)} ${s.label}: ${s.outputSummary} (${s.ms}ms)`);
  if (excluded.length) console.log(`  excluded ${excluded.slice(0, 8).map((e) => `${e.title}: ${e.reason}`).join("\n           ")}`);
  const sections = ["music", "screen", "dish", "place"].filter((s) => kit[s].status === "ok").length;
  const minPrompts = { early: 3, middle: 1, late: 0 }[kit.profile.supportLevel];
  const passed = sections >= 2 && kit.prompts.length >= minPrompts;
  if (!passed) failures++;
  if (SAVE && passed && kit.provenance.kind === "live") {
    const date = kit.provenance.generatedAt;
    const saved = { ...kit, provenance: { kind: "cached", generatedAt: date, note: `A saved live run from ${date}, shown as a demo.` } };
    await writeFile(new URL(`../fixtures/kits/${key}.json`, import.meta.url), JSON.stringify(saved, null, 2) + "\n");
    console.log(`  saved    fixtures/kits/${key}.json (add it to lib/demos.ts)`);
  } else if (SAVE && kit.provenance.kind !== "live") {
    console.log("  not saved: this kit isn't from a live run (is KIT_SOURCE=agent?)");
  }
}
console.log(failures ? `\n${failures} persona(s) failed.` : "\nAll personas produced a kit.");
process.exit(failures ? 1 : 0);
