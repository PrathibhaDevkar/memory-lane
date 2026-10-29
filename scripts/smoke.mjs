// End-to-end check: builds a kit for each persona through the running app and prints what came back.
//
// Run:  npm run dev:agent            (in another terminal; KIT_SOURCE=agent)
//       node scripts/smoke.mjs [base-url] [persona...] [--save] [--report] [--compare]
// --save writes each live kit to fixtures/kits/<persona>.json, labeled as a saved run, for use
// as a demo (then add it to lib/demos.ts).
// --compare also asks /api/compare for each persona (Claude on its own, checked against Qloo) and
// prints what the checks found and what it cost; --report adds them to the audit.
// Default base URL: http://localhost:3000. Personas: rosa walt june swift margaret okafor elena (default: all).
// With SMOKE_TOKEN set (npm run smoke reads .env.local), the run skips the live-kit limits and
// never gets the example profile's reused kit, so every kit is built fresh.
// Each live kit prints its Claude token use and cost at list prices, and the audit and token
// alerts the API returns in its headers. --report also writes audits/<date>-<model>-<effort>.md,
// the record the team reviews before approving a model change (CLAUDE.md, docs/token-alerts.md).

import { mkdir, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const SAVE = args.includes("--save");
const REPORT = args.includes("--report");
const COMPARE = args.includes("--compare");
const rows = [];
const compared = [];
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
  const header = (name) => res.headers.get(name);
  if (profile.suddenChange) {
    const ok = res.ok && kit?.mode === "safety_stop";
    rows.push({ key, passed: ok, note: "safety stop, no Claude call", secs });
    console.log(ok ? "  safety stop, no kit (as expected)" : `  FAILED: expected a safety stop, got ${JSON.stringify(kit).slice(0, 200)}`);
    if (!ok) failures++;
    continue;
  }
  if (!res.ok || !kit?.music) {
    failures++;
    console.log("  FAILED:", JSON.stringify(kit).slice(0, 300));
    rows.push({ key, passed: false, note: `HTTP ${res.status}`, secs });
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
  if (kit.provenance.kind !== "live") {
    console.log("  tokens   none: a saved or reused kit, no Claude call");
  } else if (claude.length) {
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
  if (header("x-kit-audit")) {
    console.log(`  audit    ${header("x-kit-audit")} · ${header("x-claude-model")} · ${header("x-claude-calls")} Claude calls · ${header("x-claude-tokens")} · $${header("x-claude-cost-usd")}`);
  }
  if (header("x-token-alert")) console.log(`  ALERT    ${header("x-token-alert")}`);
  rows.push({
    key, passed, secs, sections, questions: kit.prompts.length, source: kit.provenance.kind,
    model: header("x-claude-model") ?? "none", effort: claude.at(-1)?.input.effort ?? "none", calls: header("x-claude-calls") ?? String(claude.length),
    tokens: header("x-claude-tokens") ?? "", cost: header("x-claude-cost-usd") ?? "", alert: header("x-token-alert") ?? "",
  });
  if (COMPARE) await compare(key, profile);
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

/** Claude on its own for the same person, with what the checks found (lib/compare-summary.ts). */
async function compare(key, profile) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/compare`, { method: "POST", headers, body: JSON.stringify(profile) });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const c = await res.json().catch(() => null);
  if (!res.ok || c?.mode !== "comparison") {
    failures++;
    console.log(`  compare  FAILED (HTTP ${res.status}): ${JSON.stringify(c).slice(0, 200)}`);
    compared.push({ key, secs, note: `HTTP ${res.status}` });
    return;
  }
  const checkable = c.picks.filter((p) => p.section !== "dish");
  const screen = c.picks.filter((p) => p.section === "screen");
  const row = {
    key, secs, source: c.provenance.kind,
    found: `${checkable.filter((p) => p.inQloo === "yes").length} of ${checkable.length}`,
    inYears: `${screen.filter((p) => p.inEra === "yes").length} of ${screen.length}`,
    leftOut: c.picks.filter((p) => p.screenedOut).length,
    kept: `${c.questions.filter((q) => q.keeps).length} of ${c.questions.length}`,
    tokens: res.headers.get("x-claude-tokens") ?? "", cost: res.headers.get("x-claude-cost-usd") ?? "",
  };
  compared.push(row);
  console.log(`  compare  Claude on its own (${c.model}, ${secs}s, ${row.source}): found in Qloo ${row.found} · films in their years ${row.inYears} · left out ${row.leftOut} · questions kept ${row.kept}${row.cost ? ` · ${row.tokens} · $${row.cost}` : ""}`);
  for (const p of c.picks) console.log(`           ${p.section.padEnd(6)} ${p.title}${p.year ? ` (${p.year})` : ""}: in Qloo ${p.inQloo}${p.qlooYear ? `, Qloo year ${p.qlooYear}` : ""}${p.section === "screen" ? `, in their years ${p.inEra}` : ""}${p.screenedOut ? `, left out: ${p.screenedOut}` : ""}`);
  for (const q of c.questions) console.log(`           ${q.keeps ? "kept   " : "dropped"} ${q.text}${q.reason ? ` (${q.reason})` : ""}`);
}

if (REPORT) {
  const live = rows.filter((r) => r.model && r.model !== "none");
  const model = live[0]?.model ?? "no-model";
  const effort = live[0]?.effort ?? "none";
  const date = new Date().toISOString().slice(0, 10);
  const total = live.reduce((n, r) => n + (Number(r.cost) || 0), 0);
  const compareTotal = compared.reduce((n, r) => n + (Number(r.cost) || 0), 0);
  const cell = (s) => String(s ?? "").replace(/\|/g, "/");
  const lines = [
    `# Smoke-check audit: ${model} at ${effort} effort, ${date}`,
    "",
    `Base URL: ${BASE}. ${rows.filter((r) => r.passed).length} of ${rows.length} personas passed. Claude cost for the run: $${total.toFixed(4)} at list prices${compared.length ? `, plus $${compareTotal.toFixed(4)} for the comparisons` : ""}.`,
    "",
    "| Persona | Passed | Source | Sections | Questions | Claude calls | Tokens | Cost (US$) | Seconds | Alerts |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.key} | ${r.passed ? "yes" : "no"} | ${cell(r.source ?? r.note)} | ${cell(r.sections)} | ${cell(r.questions)} | ${cell(r.calls)} | ${cell(r.tokens)} | ${cell(r.cost)} | ${r.secs} | ${cell(r.alert)} |`),
    "",
    ...(compared.length
      ? [
          "Claude on its own (`--compare`), checked against Qloo and the question rules:",
          "",
          "| Persona | Source | Found in Qloo | Films in their years | Left out by filters | Questions kept | Tokens | Cost (US$) | Seconds |",
          "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
          ...compared.map((r) => `| ${r.key} | ${cell(r.source ?? r.note)} | ${cell(r.found)} | ${cell(r.inYears)} | ${cell(r.leftOut)} | ${cell(r.kept)} | ${cell(r.tokens)} | ${cell(r.cost)} | ${r.secs} |`),
          "",
        ]
      : []),
    "Read the kits themselves too: questions that invite stories, picks from the right era, nothing on an avoid list.",
    "Approval: _names and date_ (see CLAUDE.md, Model rule).",
    "",
  ];
  const dir = new URL("../audits/", import.meta.url);
  await mkdir(dir, { recursive: true });
  const file = new URL(`${date}-${model}-${effort}.md`, dir);
  await writeFile(file, lines.join("\n"));
  console.log(`Audit report: audits/${date}-${model}-${effort}.md`);
}
process.exit(failures ? 1 : 0);
