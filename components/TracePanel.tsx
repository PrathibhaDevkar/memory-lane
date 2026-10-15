// "How this kit was made" (docs/plan.md §12.5): every Claude turn, Qloo lookup, filter and
// check, with what was screened out and why. Pure and collapsible (a <details> element), so it
// renders on the server and works without JavaScript.

import type { TraceStep } from "@/lib/types";

const KIND_LABEL: Record<TraceStep["kind"], string> = {
  llm: "Claude",
  tool: "Qloo",
  filter: "Filter",
  validator: "Check",
};

const seconds = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

export function TracePanel({ trace }: { trace: TraceStep[] }) {
  if (!trace.length) return null;
  const claude = trace.filter((s) => s.kind === "llm").length;
  const qloo = trace.filter((s) => s.kind === "tool").length;
  const excluded = trace.reduce((n, s) => n + s.excluded.length, 0);
  const totalMs = trace.reduce((n, s) => n + s.ms, 0);
  const summary = [
    claude ? `${claude} Claude ${claude === 1 ? "turn" : "turns"}` : null,
    `${qloo} Qloo ${qloo === 1 ? "lookup" : "lookups"}`,
    `${excluded} screened out`,
    totalMs ? seconds(totalMs) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="no-print rounded-2xl border border-line bg-card p-5 sm:p-6">
      <summary className="cursor-pointer">
        <span className="font-serif text-2xl font-semibold">How this kit was made</span>
        <span className="mt-1 block text-sm text-muted">{summary}</span>
      </summary>
      <ol className="mt-5 space-y-4">
        {trace.map((step) => (
          <li key={step.id} className="border-l-2 border-line pl-4">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted">
                {KIND_LABEL[step.kind]}
              </span>
              <span className="font-medium">{step.label}</span>
              {step.status === "gap" && <span className="text-sm text-error">gap</span>}
              {step.ms > 0 && <span className="text-sm text-muted">{seconds(step.ms)}</span>}
            </p>
            <p className="mt-1 text-sm">{step.outputSummary}</p>
            {step.excluded.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-accent">
                  {step.excluded.length} screened out, and why
                </summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {step.excluded.map((e) => (
                    <li key={`${e.title}-${e.reason}`}>
                      <span className="font-medium">{e.title}</span>
                      <span className="text-muted">: {e.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
