// Renders a session kit. Pure (no state, no browser APIs) so it can be rendered and tested on the server.

import type { ReactNode } from "react";
import { SUPPORT_LEVELS, WATCH_FOR, WATCH_FOR_ACTION } from "@/lib/care";
import { isSpotifySearch } from "@/lib/links";
import type { DishItem, Kit, MediaItem, PlaceItem, Provenance, Source } from "@/lib/types";
import { TracePanel } from "./TracePanel";

type Section<T> = { status: "ok" | "gap"; items: T[]; gapReason?: string };

type Props = {
  kit: Kit;
  /** Called when a Spotify or YouTube search is opened (for analytics; no title is passed). */
  onMediaOpen?: (service: "spotify" | "youtube") => void;
  /** Called when "How this kit was made" is opened. */
  onTraceOpen?: () => void;
};

export function KitView({ kit, onMediaOpen, onTraceOpen }: Props) {
  const { profile, era } = kit;
  return (
    <article className="space-y-6" aria-labelledby="kit-title">
      <ProvenanceBanner provenance={kit.provenance} />

      <header className="space-y-2">
        <h2 id="kit-title" className="font-serif text-3xl font-semibold sm:text-4xl">
          A session kit for {profile.displayName}
        </h2>
        <p className="text-muted">
          Born {profile.birthYear} · grew up in {profile.hometown} · music, films and places from{" "}
          <strong className="text-ink">
            {era.start}–{era.end}
          </strong>
        </p>
        <p className="text-muted">
          Starting from: {profile.favorites.map((f) => f.text).join(", ")} · Support today:{" "}
          {SUPPORT_LEVELS[profile.supportLevel].label.toLowerCase()}
        </p>
      </header>

      <WatchFor />

      <SectionCard title="Songs to play" section={kit.music}>
        {(items) => (
          <ul className="divide-y divide-line">
            {items.map((m) => (
              <MediaRow key={m.qlooId ?? m.title} item={m} onOpen={onMediaOpen} />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Something to watch" section={kit.screen}>
        {(items) => (
          <ul className="divide-y divide-line">
            {items.map((m) => (
              <MediaRow key={m.qlooId ?? m.title} item={m} onOpen={onMediaOpen} />
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="A dish to talk about" section={kit.dish}>
          {(items) => items.map((d) => <DishCard key={d.qlooTagId ?? d.name} dish={d} />)}
        </SectionCard>
        <SectionCard title="A place to talk about" section={kit.place}>
          {(items) => items.map((p) => <PlaceCard key={p.qlooId ?? p.name} place={p} />)}
        </SectionCard>
      </div>

      <section className="rounded-2xl border border-line bg-card p-5 sm:p-6" aria-labelledby="prompts-title">
        <h3 id="prompts-title" className="font-serif text-2xl font-semibold">
          {profile.supportLevel === "late" ? "Things to say" : "Questions to ask"}
        </h3>
        <p className="mt-1 text-muted">
          {profile.supportLevel === "late"
            ? "A few gentle words while the music plays. Answers aren't needed."
            : "One at a time, with no right answers. Follow where the conversation goes; a \u201cno\u201d is fine."}
        </p>
        {kit.prompts.length ? (
          <ol className="mt-4 list-decimal space-y-2 pl-6 marker:text-muted">
            {kit.prompts.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        ) : profile.supportLevel === "late" ? (
          <p className="mt-4 text-muted">Music first today. No questions needed; your company is enough.</p>
        ) : (
          <GapNotice reason="No questions passed our question check this time." />
        )}
      </section>

      {kit.activityIdeas.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-5 sm:p-6" aria-labelledby="ideas-title">
          <h3 id="ideas-title" className="font-serif text-2xl font-semibold">
            Ideas to try
          </h3>
          <p className="mt-1 text-muted">Suggestions written by the assistant, not from Qloo. Use what suits the day.</p>
          <ul className="mt-4 list-disc space-y-2 pl-6 marker:text-muted">
            {kit.activityIdeas.map((idea) => (
              <li key={idea.text}>{idea.text}</li>
            ))}
          </ul>
        </section>
      )}

      <TracePanel trace={kit.trace} onOpen={onTraceOpen} />
    </article>
  );
}

// Shown on every kit (P5): what distress can look like, and that stopping is fine.
function WatchFor() {
  return (
    <aside aria-labelledby="watch-title" className="rounded-xl border-2 border-control bg-gap px-5 py-4">
      <p id="watch-title" className="text-lg font-semibold">
        Watch for
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        {WATCH_FOR.map((sign) => (
          <li key={sign}>{sign}</li>
        ))}
      </ul>
      <p className="mt-3 font-medium">{WATCH_FOR_ACTION}</p>
    </aside>
  );
}

function ProvenanceBanner({ provenance }: { provenance: Provenance }) {
  if (provenance.kind === "live") return null;
  const title = provenance.kind === "fixture" ? "Demo kit" : `Saved run from ${provenance.generatedAt.slice(0, 10)}`;
  return (
    <div role="note" className="rounded-xl border border-note-line bg-note px-4 py-3">
      <p className="font-semibold">{title}</p>
      {provenance.note && <p className="mt-1">{provenance.note}</p>}
    </div>
  );
}

function SectionCard<T>({
  title,
  section,
  children,
}: {
  title: string;
  section: Section<T>;
  children: (items: T[]) => ReactNode;
}) {
  const headingId = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section className="rounded-2xl border border-line bg-card p-5 sm:p-6" aria-labelledby={headingId}>
      <h3 id={headingId} className="font-serif text-2xl font-semibold">
        {title}
      </h3>
      <div className="mt-3">
        {section.status === "ok" ? children(section.items) : <GapNotice reason={section.gapReason} />}
      </div>
    </section>
  );
}

// D6: a missing section says so and why. It's never filled with guesses.
function GapNotice({ reason }: { reason?: string }) {
  return (
    <div className="rounded-xl bg-gap px-4 py-3 text-muted">
      <p className="font-medium text-ink">We couldn&apos;t find this one.</p>
      {reason && <p className="mt-1">{reason}</p>}
      <p className="mt-1">We leave it empty rather than guess.</p>
    </div>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "qloo") return null;
  return (
    <span className="ml-2 rounded-full border border-control px-2 py-0.5 align-middle text-sm text-muted">
      Not checked against Qloo
    </span>
  );
}

function MediaRow({ item, onOpen }: { item: MediaItem; onOpen?: (service: "spotify" | "youtube") => void }) {
  const spotify = isSpotifySearch(item.searchUrl);
  const where = spotify ? "Spotify" : "YouTube";
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-lg font-semibold">
          {item.title}
          {item.year && <span className="font-normal text-muted"> ({item.year})</span>}
          <SourceBadge source={item.source} />
        </p>
        <p className="text-muted">{item.whyPicked}</p>
      </div>
      <a
        href={item.searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onOpen?.(spotify ? "spotify" : "youtube")}
        className="no-print btn btn-link shrink-0 self-start sm:self-auto"
      >
        Search on {where} ↗<span className="sr-only"> (opens a new tab)</span>
      </a>
    </li>
  );
}

function DishCard({ dish }: { dish: DishItem }) {
  return (
    <div className="space-y-2">
      <p className="text-lg font-semibold">
        {dish.name}
        <SourceBadge source={dish.source} />
      </p>
      {dish.fromPlace && <p className="text-muted">A specialty at {dish.fromPlace}, per Qloo.</p>}
      <p className="rounded-lg bg-accent-soft px-4 py-3">{dish.caveat}</p>
    </div>
  );
}

function PlaceCard({ place }: { place: PlaceItem }) {
  return (
    <div className="space-y-1">
      <p className="text-lg font-semibold">
        {place.name}
        <SourceBadge source={place.source} />
      </p>
      <p className="text-muted">{place.whyPicked}</p>
    </div>
  );
}
