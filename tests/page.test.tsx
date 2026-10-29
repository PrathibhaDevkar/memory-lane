import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

// One top-level heading: screen-reader users jump to it, and an accessibility check flags a page
// without one (the final judge test on Oct 29 found none).
describe("home page", () => {
  it("has exactly one h1, the app's name", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Memory Lane<\/h1>/);
  });
});
