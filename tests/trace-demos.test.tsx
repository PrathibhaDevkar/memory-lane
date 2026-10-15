import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import rosa from "@/fixtures/kits/rosa.json";
import { KitView } from "@/components/KitView";
import { buildMs, TracePanel } from "@/components/TracePanel";
import { DEMOS } from "@/lib/demos";
import { fixtureKit } from "@/lib/kit-source";
import { KitResponseSchema, KitSchema, type TraceStep } from "@/lib/types";

const kit = KitSchema.parse(rosa);

describe("TracePanel", () => {
  it("summarizes the run honestly: the sample kit had no Claude turns", () => {
    const html = renderToStaticMarkup(<TracePanel trace={kit.trace} />);
    expect(html).toContain("How this kit was made");
    expect(html).toContain("4 Qloo lookups");
    expect(html).not.toContain("Claude turn");
    expect(html).toContain("hand-picked for this sample (no Claude call)");
  });

  it("lists what was screened out, with the reason", () => {
    const html = renderToStaticMarkup(<TracePanel trace={kit.trace} />);
    expect(html).toContain("Charly (1968)");
    expect(html).toContain("Sensitive theme: memory decline.");
    expect(html).toMatch(/\d+ screened out, and why/);
  });

  it("counts Claude turns, marks gaps, and shows timing for live runs", () => {
    const trace: TraceStep[] = [
      { id: "a", kind: "llm", label: "Claude, turn 1", input: {}, outputSummary: "Asked for: resolve_favorite", excluded: [], ms: 2400, status: "ok" },
      { id: "b", kind: "tool", label: "get_dish", input: {}, outputSummary: "Qloo returned 429", excluded: [], ms: 300, status: "gap" },
    ];
    const html = renderToStaticMarkup(<TracePanel trace={trace} />);
    expect(html).toContain("1 Claude turn ·");
    expect(html).toContain("2.4 s");
    expect(html).toContain(">gap<");
  });

  it("times a turn's parallel lookups as their longest one, not their sum", () => {
    const step = (id: string, kind: TraceStep["kind"], ms: number): TraceStep => ({ id, kind, label: id, input: {}, outputSummary: "", excluded: [], ms, status: "ok" });
    const trace = [step("t1", "llm", 1000), step("q1", "tool", 3000), step("q2", "tool", 2800), step("q3", "tool", 3100), step("t2", "llm", 2000), step("v", "validator", 5)];
    expect(buildMs(trace)).toBe(1000 + 3100 + 2000 + 5);
    expect(renderToStaticMarkup(<TracePanel trace={trace} />)).toContain("6.1 s");
  });

  it("appears at the bottom of every kit, and renders nothing for an empty trace", () => {
    expect(renderToStaticMarkup(<KitView kit={kit} />)).toContain("How this kit was made");
    expect(renderToStaticMarkup(<TracePanel trace={[]} />)).toBe("");
  });
});

describe("demos", () => {
  it("every demo matches the shared contract and has a unique id", () => {
    for (const d of DEMOS) expect(KitResponseSchema.safeParse(d.response).success, d.id).toBe(true);
    expect(new Set(DEMOS.map((d) => d.id)).size).toBe(DEMOS.length);
  });

  it("includes the must-pass safety demo, which shows no kit", () => {
    const margaret = DEMOS.find((d) => d.id === "margaret")!;
    expect(margaret.response.mode).toBe("safety_stop");
    expect(margaret.response.profile.suddenChange).toBe(true);
  });

  it("labels saved kits so they're never mistaken for live runs", () => {
    for (const d of DEMOS) if (d.response.mode !== "safety_stop") expect(["fixture", "cached"]).toContain(d.response.provenance.kind);
  });
});

describe("sample kit wording", () => {
  it("as a demo, the note doesn't claim every request returns it; as the stand-in response, it does", () => {
    expect(kit.provenance.note).toBe("A saved sample kit for Rosa, built from real Qloo results saved on Oct 8.");
    const standIn = fixtureKit({ ...kit.profile, displayName: "Walt", birthYear: 1950, hometown: "Memphis" });
    expect(standIn.provenance.note).toContain("Every request shows this sample until live kits are switched on.");
    expect(standIn.provenance.note).toContain("You asked for Walt (born 1950, Memphis).");
  });
});
