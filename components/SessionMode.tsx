"use client";

// Session mode (docs/plan.md §12.5): one card at a time, large type, made for a tablet held
// during the session. Each reaction is logged and moves on; "Stop" ends with reassurance (P5).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/analytics/client";
import { isSpotifySearch } from "@/lib/links";
import { localVoice, spokenText } from "@/lib/read-aloud";
import { buildCards, CARD_LABEL, REACTIONS, type LogEntry, type Reaction, type SessionCard, type SessionLog } from "@/lib/session";
import type { Kit } from "@/lib/types";

type Props = { kit: Kit; onEnd: (log: SessionLog) => void; onBack: () => void };

const speech = () => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

/** The on-device voice to read with (its URI), or "" when there isn't one. Voices load late, so this listens. */
function useLocalVoice(): string {
  return useSyncExternalStore(
    (onChange) => {
      const s = speech();
      if (!s) return () => {};
      // Older Safari has only the onvoiceschanged property.
      if (typeof s.addEventListener !== "function") {
        s.onvoiceschanged = onChange;
        return () => {
          s.onvoiceschanged = null;
        };
      }
      s.addEventListener("voiceschanged", onChange);
      return () => s.removeEventListener("voiceschanged", onChange);
    },
    () => localVoice(speech()?.getVoices() ?? [])?.voiceURI ?? "",
    () => "",
  );
}

/** Reads the card on screen aloud; stops when the card changes or the session ends. */
function ReadAloud({ card }: { card: SessionCard }) {
  const voiceURI = useLocalVoice();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    return () => speech()?.cancel();
  }, [card.id]);
  if (!voiceURI) return null;

  function toggle() {
    const s = speech();
    const voice = s?.getVoices().find((v) => v.voiceURI === voiceURI);
    if (!s || !voice) return;
    s.cancel();
    if (speaking) return setSpeaking(false);
    const utterance = new SpeechSynthesisUtterance(spokenText(card));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.9; // a little slower than usual
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    track("read_aloud", {});
    setSpeaking(true);
    s.speak(utterance);
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={speaking} className="btn btn-secondary min-h-14 self-start px-6 text-lg">
      {speaking ? "Stop reading" : "Read aloud"}
    </button>
  );
}

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
          className="btn btn-primary mt-8 min-h-14 px-8 text-lg"
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
        <button type="button" onClick={onBack} className="btn btn-secondary mt-6">
          ← Back to the kit
        </button>
      </section>
    );
  }

  const card = cards[index];
  return (
    <section aria-labelledby="card-title" className="mx-auto flex max-w-2xl flex-col">
      <div className="no-print flex items-center justify-between gap-3">
        <p aria-live="polite" className="font-medium text-muted">
          {index + 1} of {cards.length}
        </p>
        <button type="button" onClick={() => finish(entries)} className="btn btn-secondary">
          End session
        </button>
      </div>

      <div className="mt-3 flex flex-col rounded-2xl border border-line bg-card p-5 sm:mt-4 sm:p-10">
        <p className="font-semibold text-muted">{CARD_LABEL[card.kind]}</p>
        {/* A long name ("Fitzgerald") can't fit a 320px screen at Largest text; break it rather than push the page sideways. */}
        <h2 id="card-title" ref={headingRef} tabIndex={-1} className="mt-1 font-serif text-3xl font-semibold leading-tight outline-none [overflow-wrap:anywhere] sm:mt-2 sm:text-5xl">
          {card.title}
        </h2>
        {card.detail && <p className="mt-3 text-lg text-muted sm:mt-4">{card.detail}</p>}
        <div className="no-print mt-4 flex flex-wrap gap-3 sm:mt-6">
          {card.link && (
            <a
              href={card.link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("media_opened", { where: "session", service: isSpotifySearch(card.link!.href) ? "spotify" : "youtube" })}
              className="btn btn-link min-h-14 self-start px-6 text-lg"
            >
              {card.link.label} ↗<span className="sr-only"> (opens a new tab)</span>
            </a>
          )}
          <ReadAloud key={card.id} card={card} />
        </div>
      </div>

      <div className="no-print mt-3 sm:mt-4">
        <p id="reaction-hint" className="mb-2 text-muted sm:mb-3">
          How did that land? If they seem upset or tired, pause or tap Stop.
        </p>
        {/* As many to a row as fit at 7rem each, so larger text gets fewer, wider buttons ("Not interested"
            spilled out of its button on a tablet at Large text). */}
        <div role="group" aria-describedby="reaction-hint" className="flex flex-wrap gap-3">
          {REACTIONS.filter((r) => r.value !== "stopped").map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => react(r.value)}
              className="min-h-16 flex-[1_1_7rem] rounded-xl border-2 border-control bg-card px-3 py-4 text-lg font-semibold hover:bg-accent-soft"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {/* Stop has its own row, pinned to the bottom of the screen when the card is too tall to leave room,
          so it's always in reach (on a phone the reactions sat below the screen). Only Stop is pinned:
          all five took most of a small screen at Largest text and covered the card. */}
      <div className="no-print sticky bottom-0 bg-paper pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => react("stopped")}
          aria-describedby="reaction-hint"
          className="min-h-16 w-full rounded-xl border-2 border-error bg-card px-3 py-4 text-lg font-semibold text-error"
        >
          {REACTIONS.find((r) => r.value === "stopped")!.label}
        </button>
      </div>
    </section>
  );
}
