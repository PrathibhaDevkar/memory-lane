// End-to-end check: builds a kit for each persona through the running app and prints what came back.
//
// Run:  npm run dev:agent            (in another terminal; KIT_SOURCE=agent)
//       node scripts/smoke.mjs [base-url] [persona...]
// Default base URL: http://localhost:3000. Personas: rosa walt june swift (default: all).

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000";
const only = process.argv.slice(2).filter((a) => !a.startsWith("http"));

const PERSONAS = {
  rosa: { displayName: "Rosa", birthYear: 1942, hometown: "Chicago", favorites: [{ text: "Frank Sinatra", kind: "artist" }], thingsToAvoid: ["none"] },
  walt: { displayName: "Walt", birthYear: 1950, hometown: "Memphis", favorites: [{ text: "Elvis Presley", kind: "artist" }], thingsToAvoid: ["war films"] },
  june: { displayName: "June", birthYear: 1958, hometown: "Los Angeles", favorites: [{ text: "The Sound of Music", kind: "movie" }], thingsToAvoid: ["hospitals"] },
  // The modern-favorite hop (D2): music should still come from 1952–1972.
  swift: { displayName: "Rosa (modern favorite)", birthYear: 1942, hometown: "Chicago", favorites: [{ text: "Taylor Swift", kind: "artist" }], thingsToAvoid: ["none"] },
};

let failures = 0;
for (const [key, profile] of Object.entries(PERSONAS)) {
  if (only.length && !only.includes(key)) continue;
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/kit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(profile) });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const kit = await res.json().catch(() => null);
  console.log(`\n=== ${profile.displayName}: born ${profile.birthYear}, ${profile.hometown}, favorite ${profile.favorites[0].text} (${secs}s, HTTP ${res.status})`);
  if (!res.ok || !kit?.music) {
    failures++;
    console.log("  FAILED:", JSON.stringify(kit).slice(0, 300));
    continue;
  }
  const show = (label, section, fmt) =>
    console.log(`  ${label.padEnd(8)} ${section.status === "ok" ? section.items.map(fmt).join(" | ") : `GAP: ${section.gapReason}`}`);
  console.log(`  era      ${kit.era.start}–${kit.era.end} · source: ${kit.provenance.kind}`);
  show("music", kit.music, (i) => i.title);
  show("screen", kit.screen, (i) => `${i.title} (${i.year})`);
  show("dish", kit.dish, (i) => `${i.name} @ ${i.fromPlace}`);
  show("place", kit.place, (i) => i.name);
  console.log(`  prompts  ${kit.prompts.length}`);
  for (const p of kit.prompts) console.log(`           - ${p}`);
  const claude = kit.trace.filter((s) => s.kind === "llm");
  const tools = kit.trace.filter((s) => s.kind === "tool");
  const excluded = kit.trace.flatMap((s) => s.excluded);
  console.log(`  agent    ${claude.length} Claude turns, ${tools.length} tool calls, ${excluded.length} exclusions`);
  for (const s of kit.trace) console.log(`           ${s.kind.padEnd(9)} ${s.label}: ${s.outputSummary} (${s.ms}ms)`);
  if (excluded.length) console.log(`  excluded ${excluded.slice(0, 8).map((e) => `${e.title}: ${e.reason}`).join("\n           ")}`);
  const sections = ["music", "screen", "dish", "place"].filter((s) => kit[s].status === "ok").length;
  if (sections < 2 || kit.prompts.length < 3) failures++;
}
console.log(failures ? `\n${failures} persona(s) failed.` : "\nAll personas produced a kit.");
process.exit(failures ? 1 : 0);
