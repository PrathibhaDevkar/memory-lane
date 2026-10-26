import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuildProgress, describeStep, PHASE_TEXT, startProgress, withEvent } from "@/components/BuildProgress";
import type { ProgressStep } from "@/lib/kit-stream";

// The panel a caregiver sees while a live kit builds.

const tool = (label: string, outputSummary: string, extra: Partial<ProgressStep> = {}): ProgressStep => ({
  id: label,
  kind: "tool",
  label,
  outputSummary,
  excluded: [],
  ms: 500,
  status: "ok",
  ...extra,
});

describe("describeStep", () => {
  it("puts each lookup in plain words, keeping the trace's detail", () => {
    expect(describeStep(tool("resolve_favorite", '"Frank Sinatra" → Frank Sinatra'))).toEqual({ text: "Found their favorite in Qloo", detail: '"Frank Sinatra" → Frank Sinatra' });
    expect(describeStep(tool("get_screen(movie)", "12 returned for 1952–1972")).text).toBe("Films from their years");
    expect(describeStep(tool("get_dish", "8 restaurants returned")).text).toBe("Dishes from hometown restaurants");
    expect(describeStep(tool("get_places", "No Qloo match", { status: "gap" })).text).toBe("Nothing found: Places in their hometown");
  });

  it("says what Claude did", () => {
    const turn = { ...tool("Claude, turn 1", "Asked for: submit_kit"), kind: "llm" as const, ms: 9400 };
    expect(describeStep(turn)).toEqual({ text: "Claude chose the picks and wrote the questions", detail: "9 s" });
    expect(describeStep({ ...turn, outputSummary: "Asked for: get_music" }).text).toBe("Claude asked for another lookup");
    expect(describeStep({ ...turn, label: "Claude, an artist for the traditions", outputSummary: "Named Bing Crosby" }).text).toBe("Claude named an artist for their traditions");
  });
});

describe("BuildProgress", () => {
  it("shows finished steps, what was screened out and why, and what's happening now", () => {
    let progress = startProgress("Rosa", Date.now());
    progress = withEvent(progress, { type: "phase", phase: "lookups" });
    progress = withEvent(progress, { type: "step", step: tool("get_screen(movie)", "12 returned for 1952–1972, 2 excluded, 6 offered", { excluded: [{ title: "Patton", reason: "War genre" }] }) });
    progress = withEvent(progress, { type: "phase", phase: "choosing" });
    const html = renderToStaticMarkup(<BuildProgress progress={progress} />);
    expect(html).toContain("Putting together Rosa&#x27;s kit");
    expect(html).toContain("Films from their years");
    expect(html).toContain("Screened out: Patton (War genre)");
    // Only the phase is announced to screen readers.
    expect(html).toContain(`role="status" class="sr-only">${PHASE_TEXT.choosing}`);
    expect(html).not.toContain(PHASE_TEXT.lookups);
  });

  it("starts with a plain line before the first event", () => {
    expect(renderToStaticMarkup(<BuildProgress progress={startProgress("Walt")} />)).toContain("Getting started…");
  });
});
