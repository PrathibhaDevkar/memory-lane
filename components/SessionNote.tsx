"use client";

// The session note (docs/plan.md §12.6, P8 "close the loop"): what was tried and how it landed,
// as a short care note to copy, share or print. Built and kept in the browser only (D11).

import { useState } from "react";
import { avoidNextTime, buildCareNote, type SessionLog } from "@/lib/session";
import { whatsappUrl } from "@/lib/share";
import type { Kit } from "@/lib/types";

type Props = {
  kit: Kit;
  log: SessionLog;
  onBuildNext: (extraAvoid: string[]) => void;
  onBackToKit: () => void;
};

export function SessionNote({ kit, log, onBuildNext, onBackToKit }: Props) {
  const [note, setNote] = useState(() => buildCareNote(kit, log));
  const [copied, setCopied] = useState(false);
  const avoid = avoidNextTime(log);

  async function copy() {
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article aria-labelledby="note-title" className="space-y-6">
      <header>
        <h2 id="note-title" className="font-serif text-3xl font-semibold sm:text-4xl">
          Session note for {kit.profile.displayName}
        </h2>
        <p className="mt-2 text-muted">
          Written from what you marked. Edit anything before you share it. Memory Lane doesn&apos;t keep a copy.
        </p>
      </header>

      <div>
        <label htmlFor="care-note" className="font-semibold">
          Care note
        </label>
        <textarea
          id="care-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={8}
          className="mt-2 block min-h-48 w-full rounded-xl border border-line bg-card p-4 text-lg leading-relaxed [field-sizing:content]"
        />
      </div>

      <div className="no-print flex flex-wrap gap-3">
        <button type="button" onClick={copy} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink">
          {copied ? "Copied" : "Copy note"}
        </button>
        <a
          href={whatsappUrl(note)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-line px-5 py-2.5 font-medium hover:bg-accent-soft"
        >
          Send to WhatsApp ↗<span className="sr-only"> (opens WhatsApp in a new tab)</span>
        </a>
        <button type="button" onClick={() => window.print()} className="rounded-full border border-line px-5 py-2.5 font-medium hover:bg-accent-soft">
          Print
        </button>
      </div>
      <p className="no-print text-sm text-muted">Sending to WhatsApp shares this text through WhatsApp. Only share it with the care team or family.</p>

      <div className="no-print rounded-2xl border border-line bg-card p-5">
        <p className="font-semibold">Next session</p>
        {avoid.length > 0 && (
          <p className="mt-1 text-sm">
            The next kit will leave out: <strong>{avoid.join(", ")}</strong>.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={() => onBuildNext(avoid)} className="rounded-full border border-line px-5 py-2.5 font-medium hover:bg-accent-soft">
            Build the next kit
          </button>
          <button type="button" onClick={onBackToKit} className="rounded-full border border-line px-5 py-2.5 font-medium hover:bg-accent-soft">
            Back to this kit
          </button>
        </div>
      </div>
    </article>
  );
}
