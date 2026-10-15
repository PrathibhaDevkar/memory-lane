"use client";

// Session mode (docs/plan.md §12.5): one card at a time, large type, made for a tablet held
// during the session. Each reaction is logged and moves on; "Stop" ends with reassurance (P5).

import { useEffect, useRef, useState } from "react";
import { buildCards, CARD_LABEL, REACTIONS, type LogEntry, type Reaction, type SessionLog } from "@/lib/session";
import type { Kit } from "@/lib/types";

type Props = { kit: Kit; onEnd: (log: SessionLog) => void; onBack: () => void };

export function SessionMode({ kit, onEnd, onBack }: Props) {
  const [cards] = useState(() => buildCards(kit));
  const [startedAt] = useState(() => new Date().toISOString());
  const [index, setIndex] = useState(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [stopped, setStopped] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to each new card so screen-reader and keyboard users follow along.
  useEffect(() => {
    headingRef.current?.focus();
  }, [index, stopped]);

  const finish = (log: LogEntry[]) => onEnd({ startedAt, endedAt: new Date().toISOString(), entries: log });

  function react(reaction: Reaction) {
    const card = cards[index];
    const next = [...entries, { cardId: card.id, kind: card.kind, title: card.title, reaction }];
    setEntries(next);
    if (reaction === "stopped") return setStopped(true);
    if (index + 1 >= cards.length) return finish(next);
    setIndex(index + 1);
  }

  if (stopped) {
    return (
      <section aria-labelledby="stopped-title" className="mx-auto max-w-2xl rounded-2xl border border-line bg-card p-6 text-center sm:p-10">
        <h2 id="stopped-title" ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-semibold outline-none sm:text-4xl">
          That&apos;s okay. Let&apos;s stop here.
        </h2>
        <p className="mt-4 text-lg">
          Stay close, speak softly, and offer something familiar and comforting: a hand to hold, a favorite song, a quiet
          moment. Stopping is a good outcome.
        </p>
        <button
          type="button"
          onClick={() => finish(entries)}
          className="mt-8 rounded-xl bg-accent px-6 py-3.5 text-lg font-semibold text-accent-ink"
        >
          Write the session note
        </button>
      </section>
    );
  }

  if (!cards.length) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-line bg-card p-6 text-center">
        <p className="text-lg">This kit has nothing to show in a session yet.</p>
        <button type="button" onClick={onBack} className="mt-6 rounded-full border border-line px-4 py-2 font-medium">
          ← Back to the kit
        </button>
      </section>
    );
  }

  const card = cards[index];
  return (
    <section aria-labelledby="card-title" className="mx-auto flex min-h-[70vh] max-w-2xl flex-col">
      <div className="no-print flex items-center justify-between gap-3 text-muted">
        <p aria-live="polite">
          {index + 1} of {cards.length}
        </p>
        <button type="button" onClick={() => finish(entries)} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-accent-soft">
          End session
        </button>
      </div>

      <div className="mt-6 flex flex-1 flex-col justify-center rounded-2xl border border-line bg-card p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">{CARD_LABEL[card.kind]}</p>
        <h2 id="card-title" ref={headingRef} tabIndex={-1} className="mt-2 font-serif text-4xl font-semibold leading-tight outline-none sm:text-5xl">
          {card.title}
        </h2>
        {card.detail && <p className="mt-4 text-lg text-muted">{card.detail}</p>}
        {card.link && (
          <a
            href={card.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 self-start rounded-xl border-2 border-accent px-5 py-3 text-lg font-semibold text-accent"
          >
            {card.link.label} ↗<span className="sr-only"> (opens a new tab)</span>
          </a>
        )}
      </div>

      <div className="mt-6">
        <p id="reaction-hint" className="mb-3 text-sm text-muted">
          How did that land? If they seem upset or tired, pause or tap Stop.
        </p>
        <div role="group" aria-describedby="reaction-hint" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {REACTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => react(r.value)}
              className={
                r.value === "stopped"
                  ? "col-span-2 rounded-xl border-2 border-error px-3 py-4 text-lg font-semibold text-error sm:col-span-1"
                  : "rounded-xl border border-line bg-card px-3 py-4 text-lg font-medium hover:bg-accent-soft"
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
