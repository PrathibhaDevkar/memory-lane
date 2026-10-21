import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextSizeControl } from "@/components/TextSizeControl";
import { isTextSize, TEXT_SIZE_KEY, TEXT_SIZE_SCRIPT } from "@/lib/text-size";

/** Runs the head script (app/layout.tsx) against a stand-in page and browser storage. */
function runHeadScript(stored: string | null, blocked = false) {
  const dataset: Record<string, string> = {};
  const localStorage = {
    getItem: (key: string) => {
      if (blocked) throw new Error("storage blocked");
      return key === TEXT_SIZE_KEY ? stored : null;
    },
  };
  new Function("localStorage", "document", TEXT_SIZE_SCRIPT)(localStorage, { documentElement: { dataset } });
  return dataset.textSize;
}

describe("text size", () => {
  it("applies a saved size before the page paints, and ignores anything else", () => {
    expect(runHeadScript("large")).toBe("large");
    expect(runHeadScript("largest")).toBe("largest");
    expect(runHeadScript("standard")).toBeUndefined();
    expect(runHeadScript('"><script>')).toBeUndefined();
    expect(runHeadScript(null)).toBeUndefined();
    // Blocked storage (private windows): the page starts at Standard, with no error.
    expect(runHeadScript("large", true)).toBeUndefined();
  });

  it("offers three plain choices, rendered at Standard on the server", () => {
    const html = renderToStaticMarkup(<TextSizeControl />);
    for (const label of ["Standard", "Large", "Largest"]) expect(html).toContain(`>${label}</button>`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Standard</);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(isTextSize("largest")).toBe(true);
    expect(isTextSize("huge")).toBe(false);
  });
});
