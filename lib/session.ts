// Session mode logic (docs/plan.md §12.5–12.6): turns a kit into one-at-a-time cards, records
// reactions, and writes a short care note from a template.
//
// Everything here runs in the caregiver's browser. Observations about a real person are never
// sent to Memory Lane's server or stored (D11), and the note is built from what was logged,
// so it can't invent anything.

import { SUPPORT_LEVELS } from "./care";
import { isSpotifySearch } from "./links";
import { MAX_FAVORITES, MAX_THINGS_TO_AVOID, type Favorite, type FavoriteKind, type Kit, type Profile } from "./types";

export type CardKind = "song" | "film" | "show" | "place" | "dish" | "question" | "comment" | "idea";

export type SessionCard = {
  id: string;
  kind: CardKind;
  title: string;
  detail?: string;
  link?: { href: string; label: string };
};

export type Reaction = "lit_up" | "calm" | "not_interested" | "not_today" | "stopped";

export const REACTIONS: { value: Reaction; label: string }[] = [
  { value: "lit_up", label: "Lit up" },
  { value: "calm", label: "Calm" },
  { value: "not_interested", label: "Not interested" },
  { value: "not_today", label: "Not today" },
  { value: "stopped", label: "Stop" },
];

export type LogEntry = { cardId: string; kind: CardKind; title: string; reaction: Reaction };
export type SessionLog = { startedAt: string; endedAt?: string; entries: LogEntry[] };

const linkLabel = (href: string) => (isSpotifySearch(href) ? "Search on Spotify" : "Search on YouTube");

/** Cards that name something Qloo found, so the next kit can leave it out. Questions, comments and
 * the agent's activity ideas aren't, so "Stop" on them isn't carried into the avoid list. */
const canLeaveOut = (kind: CardKind) => kind !== "question" && kind !== "comment" && kind !== "idea";

/**
 * Cards in session order: an item, then a question about it, alternating, so there is one idea
 * on screen at a time. At the late level songs come first and comments sit between them.
 */
export function buildCards(kit: Kit): SessionCard[] {
  const items: SessionCard[] = [];
  for (const m of kit.music.items)
    items.push({ id: `song-${items.length}`, kind: "song", title: m.title, detail: m.whyPicked, link: { href: m.searchUrl, label: linkLabel(m.searchUrl) } });
  for (const m of kit.screen.items)
    items.push({
      id: `screen-${items.length}`,
      kind: m.kind === "tv" ? "show" : "film",
      title: m.year ? `${m.title} (${m.year})` : m.title,
      detail: m.whyPicked,
      link: { href: m.searchUrl, label: linkLabel(m.searchUrl) },
    });
  for (const p of kit.place.items) items.push({ id: `place-${items.length}`, kind: "place", title: p.name, detail: p.whyPicked });
  for (const d of kit.dish.items)
    items.push({ id: `dish-${items.length}`, kind: "dish", title: d.name, detail: [d.fromPlace && `A specialty at ${d.fromPlace}.`, d.caveat].filter(Boolean).join(" ") });

  const late = kit.profile.supportLevel === "late";
  const talk: SessionCard[] = kit.prompts.map((p, i) => ({ id: `talk-${i}`, kind: late ? "comment" : "question", title: p }));

  const cards: SessionCard[] = [];
  const longest = Math.max(items.length, talk.length);
  for (let i = 0; i < longest; i++) {
    if (items[i]) cards.push(items[i]);
    if (talk[i]) cards.push(talk[i]);
  }
  for (const [i, idea] of kit.activityIdeas.entries()) cards.push({ id: `idea-${i}`, kind: "idea", title: idea.text });
  return cards;
}

export const CARD_LABEL: Record<CardKind, string> = {
  song: "Play a song",
  film: "A film",
  show: "A TV show",
  place: "A place to talk about",
  dish: "A dish to talk about",
  question: "Ask",
  comment: "Say",
  idea: "Try",
};

export function timeOfDay(iso: string): "morning" | "afternoon" | "evening" {
  const h = new Date(iso).getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
// Activity ideas are full sentences ending in a full stop; the note adds its own, so drop theirs.
const bare = (title: string) => title.trim().replace(/\.+$/, "");
// Ends a line with a full stop unless it already ends a sentence ("Hello, Dolly!", a question).
const sentence = (line: string) => (/[.!?]$/.test(line) ? line : `${line}.`);

/** A short, factual care note from the log. Only what was observed, plus gentle next steps. */
export function buildCareNote(kit: Kit, log: SessionLog): string {
  const name = kit.profile.displayName;
  const when = timeOfDay(log.startedAt);
  const date = new Date(log.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const titles = (r: Reaction) => log.entries.filter((e) => e.reaction === r && e.kind !== "question" && e.kind !== "comment").map((e) => bare(e.title));
  const talked = (r: Reaction) => log.entries.filter((e) => e.reaction === r && (e.kind === "question" || e.kind === "comment")).length;

  const lines = [`Reminiscence session with ${name}, ${date}, ${when}. Support today: ${SUPPORT_LEVELS[kit.profile.supportLevel].label.toLowerCase()}.`];
  if (!log.entries.length) {
    lines.push("The session ended before anything was tried.");
    return lines.join("\n");
  }
  const litUp = titles("lit_up");
  const calm = titles("calm");
  const notInterested = titles("not_interested");
  const notToday = titles("not_today");
  const stopped = log.entries.find((e) => e.reaction === "stopped");

  if (litUp.length) lines.push(sentence(`Lit up with: ${list(litUp)}`));
  if (calm.length) lines.push(sentence(`Calm with: ${list(calm)}`));
  if (talked("lit_up") + talked("calm")) lines.push(`Engaged with ${talked("lit_up") + talked("calm")} of the questions.`);
  if (notInterested.length) lines.push(sentence(`Not interested in: ${list(notInterested)}`));
  if (notToday.length || talked("not_today")) lines.push(`${sentence(`Said "not today" to ${notToday.length ? list(notToday) : "some questions"}`)} That's fine; it tells us what suits today.`);
  if (stopped) lines.push(sentence(`Stopped at: ${bare(stopped.title)}`));

  const next: string[] = [];
  if (litUp.length) next.push(`more like ${litUp[0]}`);
  if (stopped && canLeaveOut(stopped.kind)) next.push(`leave out ${bare(stopped.title)}`);
  if (stopped && when === "evening") next.push("an earlier time of day may suit better");
  if (next.length) lines.push(`Next time: ${list(next)}.`);
  return lines.join("\n");
}

const withoutYear = (title: string) => title.replace(/ \(\d{4}\)$/, "");

/** Things to add to the avoid list for the next kit: anything the session was stopped at (P5). */
export function avoidNextTime(log: SessionLog): string[] {
  return log.entries.filter((e) => e.reaction === "stopped" && canLeaveOut(e.kind)).map((e) => withoutYear(e.title));
}

// Cards that can seed the next kit, as the favorite kind Qloo looks them up by.
const FAVORITE_KIND: Partial<Record<CardKind, FavoriteKind>> = { song: "artist", film: "movie", show: "tv" };

/**
 * Favorites for the next kit: the songs, films and shows they lit up with, so Qloo finds more like
 * them (P8, close the loop: "Next time: more like …" in the note). In the order they came up.
 */
export function buildOnNextTime(log: SessionLog): Favorite[] {
  const out: Favorite[] = [];
  for (const e of log.entries) {
    const kind = FAVORITE_KIND[e.kind];
    const text = withoutYear(e.title).trim();
    if (e.reaction !== "lit_up" || !kind || !text || text.length > 80) continue;
    if (!out.some((f) => same(f.text, text))) out.push({ text, kind });
  }
  return out;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type NextKit = {
  profile: Profile;
  favoritesAdded: Favorite[];
  favoritesSkipped: Favorite[]; // lit up, but the favorites list is full
  favoritesRemoved: Favorite[]; // a favorite the session stopped at: it shouldn't seed the next kit (P5)
  avoidAdded: string[];
  avoidSkipped: string[]; // stopped at, but the avoid list is full
};

/**
 * The profile for the next kit, for the caregiver to review on the form: what lit them up is added
 * to the favorites and what the session stopped at to things to avoid (and out of the favorites),
 * within the form's limits. Nothing here leaves the browser.
 */
export function nextKitProfile(base: Profile, log: SessionLog): NextKit {
  const stoppedAt = avoidNextTime(log);
  const current = base.thingsToAvoid.filter((t) => t !== "none");
  const freshAvoid = stoppedAt.filter((t) => !current.some((c) => same(c, t)));
  const avoidAdded = freshAvoid.slice(0, Math.max(0, MAX_THINGS_TO_AVOID - current.length));
  const avoid = [...current, ...avoidAdded];

  const favoritesRemoved = base.favorites.filter((f) => stoppedAt.some((t) => same(t, f.text)));
  const kept = base.favorites.filter((f) => !favoritesRemoved.includes(f));
  const freshFavorites = buildOnNextTime(log).filter((f) => !kept.some((c) => same(c.text, f.text)));
  const favoritesAdded = freshFavorites.slice(0, Math.max(0, MAX_FAVORITES - kept.length));

  return {
    profile: { ...base, thingsToAvoid: avoid.length ? avoid : ["none"], favorites: [...kept, ...favoritesAdded] },
    favoritesAdded,
    favoritesSkipped: freshFavorites.slice(favoritesAdded.length),
    favoritesRemoved,
    avoidAdded,
    avoidSkipped: freshAvoid.slice(avoidAdded.length),
  };
}
