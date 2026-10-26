"use client";

// "Compare with Claude on its own", under a kit (docs/plan.md D5). Asks /api/compare for the same
// person without Qloo and shows the result next to the kit. Only the profile already on screen is
// sent, as for the kit itself; nothing is stored. A comparison stays shown while the kit is open.

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics/client";
import { failureReason } from "@/lib/compare-summary";
import { ComparisonSchema, type Comparison, type Kit } from "@/lib/types";
import { ComparisonView } from "./ComparisonView";

type State = { status: "idle" } | { status: "asking"; seconds: number } | { status: "shown"; comparison: Comparison } | { status: "failed"; message: string };

type Props = {
  kit: Kit;
  /** A comparison already made for this kit, shown straight away. */
  saved?: Comparison;
  onShown?: (comparison: Comparison) => void;
};

export function CompareSection({ kit, saved, onShown }: Props) {
  const [state, setState] = useState<State>(saved ? { status: "shown", comparison: saved } : { status: "idle" });
  const resultRef = useRef<HTMLHeadingElement>(null);
  const abort = useRef<AbortController | null>(null);
  const asking = state.status === "asking";

  // A second counter while Claude answers; the request stops if the kit is left.
  useEffect(() => {
    if (!asking) return;
    const timer = setInterval(() => setState((s) => (s.status === "asking" ? { ...s, seconds: s.seconds + 1 } : s)), 1000);
    return () => clearInterval(timer);
  }, [asking]);
  useEffect(() => () => abort.current?.abort(), []);

  async function compare() {
    if (asking) return;
    track("kit_action", { action: "compare" });
    abort.current = new AbortController();
    setState({ status: "asking", seconds: 0 });
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kit.profile),
        signal: abort.current.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        track("comparison_failed", { reason: failureReason(res.status, body) });
        const fromServer = (res.status === 429 || res.status === 503) && typeof body?.error === "string" ? body.error : null;
        setState({ status: "failed", message: fromServer ?? "The comparison didn't work this time. Please try again." });
        return;
      }
      const parsed = ComparisonSchema.safeParse(body);
      if (!parsed.success) {
        track("comparison_failed", { reason: "shape" });
        setState({ status: "failed", message: "The comparison came back in an unexpected shape. Please try again." });
        return;
      }
      track("comparison_shown", { source: parsed.data.provenance.kind === "live" ? "live" : "cached" });
      setState({ status: "shown", comparison: parsed.data });
      onShown?.(parsed.data);
      // Land on the result, so keyboard and screen-reader users don't have to look for it.
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      track("comparison_failed", { reason: "network" });
      setState({ status: "failed", message: "Couldn't reach Memory Lane. Check the connection and try again." });
    }
  }

  return (
    <section aria-labelledby="compare-title" className="no-print mt-6 space-y-4 rounded-2xl border border-line bg-card p-5 sm:p-6">
      {state.status === "shown" ? (
        <>
          <h3 id="compare-title" ref={resultRef} tabIndex={-1} className="font-serif text-2xl font-semibold outline-none">
            Memory Lane next to Claude on its own
          </h3>
          <ComparisonView kit={kit} comparison={state.comparison} />
        </>
      ) : (
        <>
          <h3 id="compare-title" className="font-serif text-2xl font-semibold">
            What does Qloo add?
          </h3>
          <p>
            See what Claude suggests for {kit.profile.displayName} on its own, with the same care rules but without Qloo, and
            how its picks hold up when they&apos;re checked.
          </p>
          <button type="button" onClick={compare} aria-disabled={asking} className="btn btn-secondary">
            {asking ? "Comparing…" : "Compare with Claude on its own"}
          </button>
          <div role="status">{asking && <p>Asking Claude on its own, then checking each pick in Qloo. Usually about 15 to 25 seconds.</p>}</div>
          {/* Shown, not announced: a screen reader would read it out every second. */}
          {asking && state.seconds > 0 && (
            <p aria-hidden="true" className="text-muted">
              {state.seconds} s so far
            </p>
          )}
          {state.status === "failed" && (
            <p role="alert" className="rounded-xl border-2 border-error px-4 py-3 font-medium text-error">
              {state.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
