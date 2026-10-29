import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import rosa from "@/fixtures/kits/rosa.json";
import { KitView } from "@/components/KitView";
import { KitSchema, type Kit } from "@/lib/types";

const fixture = KitSchema.parse(rosa);
const render = (kit: Kit) => renderToStaticMarkup(<KitView kit={kit} />);

describe("KitView", () => {
  it("renders every section of the fixture kit", () => {
    const html = render(fixture);
    for (const text of [
      "A session kit for Rosa",
      "1952–1972",
      "Ella Fitzgerald",
      "Designing Woman",
      "Chicago-style deep-dish pizza",
      "Maxwell Street Market",
      "Questions to ask",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("shows the demo banner for fixture kits, and nothing for live kits", () => {
    expect(render(fixture)).toContain("Demo kit");
    const live = { ...fixture, provenance: { kind: "live" as const, generatedAt: "2026-10-18" } };
    expect(render(live)).not.toContain("Demo kit");
  });

  it("labels cached kits with their run date", () => {
    const cached = { ...fixture, provenance: { kind: "cached" as const, generatedAt: "2026-10-22" } };
    expect(render(cached)).toContain("Saved run from 2026-10-22");
  });

  it("shows a gap with its reason instead of an empty section (D6)", () => {
    const html = render({
      ...fixture,
      dish: { status: "gap", items: [], gapReason: "No hometown restaurant in Qloo lists a specialty dish." },
    });
    expect(html).toContain("We couldn&#x27;t find this one.");
    expect(html).toContain("No hometown restaurant in Qloo lists a specialty dish.");
    expect(html).toContain("rather than guess");
    expect(html).not.toContain("deep-dish");
  });

  it("marks LLM-only items as not checked against Qloo", () => {
    const llmItem = { ...fixture.music.items[0], source: "llm" as const, qlooId: undefined };
    const html = render({ ...fixture, music: { status: "ok", items: [llmItem] } });
    expect(html).toContain("Not checked against Qloo");
    expect(render(fixture)).not.toContain("Not checked against Qloo");
  });

  it("shows the watch-for signs and the support level on every kit", () => {
    const html = render(fixture);
    expect(html).toContain("Watch for");
    expect(html).toContain("Stopping is a good outcome");
    expect(html).toContain("mostly independent");
  });

  it("labels activity ideas as suggestions, not Qloo data", () => {
    const html = render({ ...fixture, activityIdeas: [{ text: "A soft scarf to hold", source: "llm" }] });
    expect(html).toContain("A soft scarf to hold");
    expect(html).toContain("not from Qloo");
    expect(render(fixture)).not.toContain("Ideas to try");
  });

  it("at the late level, an empty question list is calm, not a failure", () => {
    const late = { ...fixture, prompts: [], profile: { ...fixture.profile, supportLevel: "late" as const } };
    const html = render(late);
    expect(html).toContain("Things to say");
    expect(html).toContain("No questions needed");
    expect(html).not.toContain("couldn&#x27;t find this one");
  });

  it("links out to searches in a new tab, never embeds", () => {
    const html = render(fixture);
    expect(html).not.toMatch(/<iframe|<audio|<video/);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("https://open.spotify.com/search/");
  });
});
