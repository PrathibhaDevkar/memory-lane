// Memory Lane next to Claude on its own (lib/compare.ts): the checks side by side, then each of
// Claude's picks and questions with what the checks found. Pure (no state, no browser APIs), so it
// renders on the server and in tests. For comparison only: these picks never reach a session.

import { comparisonRows, pickChecks, type PickCheck } from "@/lib/compare-summary";
import type { ComparedPick, Comparison, Kit } from "@/lib/types";
import { TracePanel } from "./TracePanel";

const SECTIONS: { key: ComparedPick["section"]; title: string }[] = [
  { key: "music", title: "Music" },
  { key: "screen", title: "Films and shows" },
  { key: "place", title: "A place" },
  { key: "dish", title: "A dish" },
];

export function ComparisonView({ kit, comparison }: { kit: Kit; comparison: Comparison }) {
  const rows = comparisonRows(kit, comparison);
  const name = kit.profile.displayName;
  return (
    <div className="space-y-6">
      {comparison.provenance.kind !== "live" && comparison.provenance.note && (
        <p role="note" className="rounded-xl border border-note-line bg-note px-4 py-3">
          {comparison.provenance.note}
        </p>
      )}
      <p>
        Claude (<span className="font-semibold">{comparison.model}</span>) was given {name}&apos;s details and Memory Lane&apos;s
        care rules, but no Qloo. Each of its picks was then looked up in Qloo and put through Memory Lane&apos;s filters, and
        each question through the question rules.
      </p>

      <div className="rounded-2xl border border-line">
        <div aria-hidden="true" className="hidden gap-4 border-b border-line px-4 py-3 font-semibold text-muted sm:grid sm:grid-cols-[1.4fr_1fr_1fr]">
          <span>Check</span>
          <span>Memory Lane</span>
          <span>Claude on its own</span>
        </div>
        <dl className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.check} className="grid gap-1 px-4 py-3 sm:grid-cols-[1.4fr_1fr_1fr] sm:gap-4">
              <dt className="font-semibold">{r.check}</dt>
              <dd>
                <span className="text-muted sm:sr-only">Memory Lane: </span>
                {r.memoryLane}
              </dd>
              <dd>
                <span className="text-muted sm:sr-only">Claude on its own: </span>
                {r.alone}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-muted">Places are matched by name only, so their town isn&apos;t checked. Dishes can&apos;t be looked up in Qloo.</p>

      <section aria-labelledby="alone-picks-title" className="space-y-4">
        <div>
          <h4 id="alone-picks-title" className="font-serif text-xl font-semibold">
            Claude&apos;s picks on its own, checked
          </h4>
          <p className="mt-1 text-muted">For comparison only: these picks aren&apos;t used in sessions.</p>
        </div>
        {SECTIONS.map(({ key, title }) => {
          const picks = comparison.picks.filter((p) => p.section === key);
          if (!picks.length) return null;
          return (
            <div key={key}>
              <h5 className="font-semibold">{title}</h5>
              <ul className="mt-2 divide-y divide-line">
                {picks.map((p) => (
                  <li key={`${p.title}-${p.year ?? ""}`} className="py-3 first:pt-0">
                    <p className="text-lg font-semibold">
                      {p.title}
                      {p.year && <span className="font-normal text-muted"> ({p.year})</span>}
                    </p>
                    {p.why && <p className="text-muted">{p.why}</p>}
                    <Checks checks={pickChecks(p, comparison.era)} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="alone-questions-title" className="space-y-3">
        <h4 id="alone-questions-title" className="font-serif text-xl font-semibold">
          {kit.profile.supportLevel === "late" ? "Claude's comments on its own, checked" : "Claude's questions on its own, checked"}
        </h4>
        {comparison.questions.length ? (
          <ul className="divide-y divide-line">
            {comparison.questions.map((q, i) => (
              <li key={`${i}-${q.text}`} className="py-3 first:pt-0">
                <p>{q.text}</p>
                <Checks checks={[q.keeps ? { ok: true, text: "Follows the question rules" } : { ok: false, text: `Would be dropped: ${(q.reason ?? "").replace(/\.$/, "")}` }]} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Claude gave none.</p>
        )}
      </section>

      <TracePanel trace={comparison.trace} title="How the comparison was made" />
    </div>
  );
}

const MARK = { true: "✓", false: "✗", null: "–" } as const;

function Checks({ checks }: { checks: PickCheck[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {checks.map((c) => (
        <li
          key={c.text}
          className={`rounded-full border px-3 py-0.5 ${c.ok === false ? "border-error text-error" : "border-control"} ${c.ok === null ? "text-muted" : ""}`}
        >
          <span aria-hidden="true">{MARK[String(c.ok) as keyof typeof MARK]} </span>
          {c.text}
        </li>
      ))}
    </ul>
  );
}
