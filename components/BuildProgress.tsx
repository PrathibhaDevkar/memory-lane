"use client";

// What the agent is doing while a live kit builds (lib/kit-stream.ts): each Qloo lookup and Claude
// call as it finishes, what was screened out and why, and what is happening now. Turns the wait into
// a look at how the kit is made. The full record stays in "How this kit was made" on the kit.

import { useEffect, useState } from "react";
import type { BuildPhase, ProgressEvent, ProgressStep } from "@/lib/kit-stream";

export type Progress = { name: string; startedAt: number; phase: BuildPhase | null; steps: ProgressStep[] };

export function startProgress(name: string, startedAt = Date.now()): Progress {
  return { name, startedAt, phase: null, steps: [] };
}

/** The progress after one more event from the stream. */
export function withEvent(progress: Progress, event: ProgressEvent): Progress {
  return event.type === "phase" ? { ...progress, phase: event.phase } : { ...progress, steps: [...progress.steps, event.step] };
}

export const PHASE_TEXT: Record<BuildPhase, string> = {
  lookups: "Looking things up in Qloo: their favorites, and music, films, places and dishes from their years…",
  choosing: "Claude is choosing the picks and writing the questions…",
};

const LOOKUPS: Record<string, string> = {
  resolve_favorite: "Found their favorite in Qloo",
  get_music: "Music that fans of it also love",
  "get_music(from film)": "Music that fans of a film from their years also love",
  "get_screen(movie)": "Films from their years",
  "get_screen(tv)": "TV shows from their years",
  get_places: "Places in their hometown",
  get_dish: "Dishes from hometown restaurants",
};

/** A step in plain words: what happened, and the detail from the trace. */
export function describeStep(step: ProgressStep): { text: string; detail: string } {
  switch (step.kind) {
    case "tool":
      return { text: step.status === "gap" ? `Nothing found: ${LOOKUPS[step.label] ?? step.label}` : (LOOKUPS[step.label] ?? `Qloo: ${step.label}`), detail: step.outputSummary };
    case "llm":
      if (step.label.startsWith("Claude, an artist")) return { text: "Claude named an artist for their traditions", detail: step.outputSummary };
      return {
        text: step.outputSummary.includes("submit_kit") ? "Claude chose the picks and wrote the questions" : "Claude asked for another lookup",
        detail: seconds(step.ms),
      };
    case "filter":
      return { text: "Screened out before Claude saw it", detail: step.outputSummary };
    case "validator":
      return { text: step.label === "grounding + question check" ? "Checked every pick against Qloo, and every question" : step.label, detail: step.outputSummary };
  }
}

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} s`;

function useElapsedSeconds(since: number) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - since) / 1000));
}

export function BuildProgress({ progress }: { progress: Progress }) {
  const elapsed = useElapsedSeconds(progress.startedAt);
  const now = progress.phase ? PHASE_TEXT[progress.phase] : "Getting started…";
  return (
    <section aria-labelledby="progress-title" className="rounded-2xl border border-line bg-card p-5 sm:p-6">
      <h2 id="progress-title" className="font-serif text-2xl font-semibold">
        Putting together {progress.name}&apos;s kit
      </h2>
      <p className="mt-1 text-muted">
        Usually about 15 to 20 seconds.{elapsed > 0 && <span aria-hidden="true"> {elapsed} s so far.</span>}
      </p>

      <ol className="mt-5 space-y-3">
        {progress.steps.map((step) => {
          const { text, detail } = describeStep(step);
          return (
            <li key={step.id} className="flex gap-3">
              <span aria-hidden="true" className={`w-5 shrink-0 font-semibold ${step.status === "gap" ? "text-muted" : "text-accent"}`}>
                {step.status === "gap" ? "–" : "✓"}
              </span>
              <span>
                <span className="block font-medium">{text}</span>
                {detail && <span className="block text-sm text-muted">{detail}</span>}
                {step.excluded.length > 0 && (
                  <span className="block text-sm">
                    Screened out: {step.excluded.slice(0, 3).map((e) => `${e.title} (${e.reason.replace(/\.$/, "")})`).join("; ")}
                    {step.excluded.length > 3 ? `, and ${step.excluded.length - 3} more` : ""}
                  </span>
                )}
              </span>
            </li>
          );
        })}
        <li className="flex gap-3">
          <span aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 rounded-full border-2 border-control border-t-accent motion-safe:animate-spin" />
          <span className="font-medium">{now}</span>
        </li>
      </ol>

      {/* Only the phase is announced, not every step, so a screen reader isn't flooded. */}
      <p role="status" className="sr-only">
        {now}
      </p>
    </section>
  );
}
