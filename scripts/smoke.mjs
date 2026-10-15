// End-to-end check: builds a kit for each persona through the running app and prints what came back.
//
// Run:  npm run dev:agent            (in another terminal; KIT_SOURCE=agent)
//       node scripts/smoke.mjs [base-url] [persona...]
// Default base URL: http://localhost:3000. Personas: rosa walt june swift margaret okafor elena (default: all).

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000";
const only = process.argv.slice(2).filter((a) => !a.startsWith("http"));

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

let failures = 0;
for (const [key, profile] of Object.entries(PERSONAS)) {
  if (only.length && !only.includes(key)) continue;
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/kit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(profile) });
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
  show("dish", kit.dish, (i) => `${i.name} @ ${i.fromPlace}`);
  show("place", kit.place, (i) => i.name);
  console.log(`  prompts  ${kit.prompts.length}${kit.activityIdeas.length ? ` · ideas: ${kit.activityIdeas.map((i) => i.text).join(" | ")}` : ""}`);
  for (const p of kit.prompts) console.log(`           - ${p}`);
  const claude = kit.trace.filter((s) => s.kind === "llm");
  const tools = kit.trace.filter((s) => s.kind === "tool");
  const excluded = kit.trace.flatMap((s) => s.excluded);
  console.log(`  agent    ${claude.length} Claude turns, ${tools.length} tool calls, ${excluded.length} exclusions`);
  for (const s of kit.trace) console.log(`           ${s.kind.padEnd(9)} ${s.label}: ${s.outputSummary} (${s.ms}ms)`);
  if (excluded.length) console.log(`  excluded ${excluded.slice(0, 8).map((e) => `${e.title}: ${e.reason}`).join("\n           ")}`);
  const sections = ["music", "screen", "dish", "place"].filter((s) => kit[s].status === "ok").length;
  const minPrompts = { early: 3, middle: 1, late: 0 }[kit.profile.supportLevel];
  if (sections < 2 || kit.prompts.length < minPrompts) failures++;
}
console.log(failures ? `\n${failures} persona(s) failed.` : "\nAll personas produced a kit.");
process.exit(failures ? 1 : 0);
