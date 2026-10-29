import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_DOC_URL, AnalyticsNote } from "@/components/AnalyticsNote";

// The footer line that tells visitors what analytics count (docs/analytics.md).
describe("analytics note", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("says what is counted, with a link to the full list, when analytics are on", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const html = renderToStaticMarkup(<AnalyticsNote />);
    expect(html).toContain("We count which screens and buttons are used, without cookies and without anything you type.");
    expect(html).toContain(`href="${ANALYTICS_DOC_URL}"`);
    expect(html).toContain('target="_blank"'); // a new tab, so the kit on screen isn't lost
    expect(html).toContain("no-print");
  });

  it("shows nothing when analytics are off", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect(renderToStaticMarkup(<AnalyticsNote />)).toBe("");
  });

  it("links to the doc that lists the events", () => {
    expect(ANALYTICS_DOC_URL).toMatch(/\/docs\/analytics\.md$/);
    expect(existsSync("docs/analytics.md")).toBe(true);
  });

  it("links to the doc on main, which production is built from, so the list matches the site", () => {
    expect(ANALYTICS_DOC_URL).toContain("/blob/main/");
  });
});
