import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXAMPLE_PROFILE, IntakeForm } from "@/components/IntakeForm";

const render = (props: Partial<Parameters<typeof IntakeForm>[0]> = {}) =>
  renderToStaticMarkup(<IntakeForm busy={false} onSubmit={() => {}} {...props} />);

const favoriteInputs = (html: string) => html.match(/placeholder="e\.g\. Frank Sinatra"/g)?.length ?? 0;

describe("IntakeForm", () => {
  it("starts with one favorite row", () => {
    expect(favoriteInputs(render())).toBe(1);
  });

  // Regression: a submit rejected for empty favorites came back with favorites: [],
  // and the form rendered no field to fix it in.
  it("keeps a favorite row when the last submit had none", () => {
    expect(favoriteInputs(render({ initial: { ...EXAMPLE_PROFILE, favorites: [] } }))).toBe(1);
  });

  it("shows the server's message next to the field and marks it invalid", () => {
    const html = render({ errors: { hometown: ["Add the city or town they grew up in."] } });
    expect(html).toContain("Add the city or town they grew up in.");
    expect(html).toMatch(/aria-invalid="true"[^>]*placeholder="City or town"|placeholder="City or town"[^>]*aria-invalid="true"/);
  });

  it("asks the sudden-change question first, with no answer preselected", () => {
    const html = render();
    expect(html.indexOf("safety check")).toBeLessThan(html.indexOf("like to be called"));
    expect(html.match(/name="[^"]*-sudden"[^>]*checked/)).toBeNull();
  });

  it("offers the three support levels in plain words", () => {
    const html = render();
    for (const label of ["Mostly independent", "Needs some help", "Needs a lot of help"]) expect(html).toContain(label);
  });

  it("keeps optional life-story details in a collapsed group that says they aren't saved", () => {
    const html = render();
    expect(html).toContain("More about them (optional)");
    expect(html).toContain("not saved");
  });

  it("disables the button while building", () => {
    expect(render({ busy: true })).toContain("Putting the kit together…");
  });
});
