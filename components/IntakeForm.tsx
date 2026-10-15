"use client";

import { useId, useState } from "react";
import { SUDDEN_CHANGE_QUESTION, SUPPORT_LEVELS } from "@/lib/care";
import {
  BIRTH_YEAR_MAX,
  BIRTH_YEAR_MIN,
  MAX_FAVORITES,
  type Favorite,
  type FavoriteKind,
  type Profile,
  type SupportLevel,
} from "@/lib/types";

export type FieldErrors = Partial<Record<keyof Profile, string[]>>;

const KIND_LABELS: Record<FavoriteKind, string> = {
  artist: "Singer or band",
  movie: "Film",
  tv: "TV show",
  other: "Something else",
};

// Fictional persona from Phase 0, for demos and quick testing.
export const EXAMPLE_PROFILE: Profile = {
  suddenChange: false,
  displayName: "Rosa",
  supportLevel: "early",
  birthYear: 1942,
  hometown: "Chicago",
  favorites: [{ text: "Frank Sinatra", kind: "artist" }],
  thingsToAvoid: ["none"],
};

type Props = {
  initial?: Profile;
  /** Ask the sudden-change question fresh, even when other answers are prefilled (a new session). */
  askSafetyAgain?: boolean;
  errors?: FieldErrors;
  busy: boolean;
  onSubmit: (profile: Profile) => void;
};

export function IntakeForm({ initial, askSafetyAgain = false, errors = {}, busy, onSubmit }: Props) {
  const id = useId();
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [birthYear, setBirthYear] = useState(initial ? String(initial.birthYear) : "");
  const [hometown, setHometown] = useState(initial?.hometown ?? "");
  // Always at least one row: a rejected submit can come back with zero favorites,
  // and the caregiver needs a field to fix it in.
  const [favorites, setFavorites] = useState<Favorite[]>(
    initial?.favorites.length ? initial.favorites : [{ text: "", kind: "artist" }],
  );
  const initialNothing = initial?.thingsToAvoid.length === 1 && initial.thingsToAvoid[0] === "none";
  const [nothingToAvoid, setNothingToAvoid] = useState(initialNothing);
  const [avoidText, setAvoidText] = useState(initial && !initialNothing ? initial.thingsToAvoid.join("\n") : "");
  // No defaults for these two: the caregiver has to choose.
  const [suddenChange, setSuddenChange] = useState<boolean | null>(askSafetyAgain ? null : (initial?.suddenChange ?? null));
  const [supportLevel, setSupportLevel] = useState<SupportLevel | null>(initial?.supportLevel ?? null);
  const [formerWork, setFormerWork] = useState(initial?.formerWork ?? "");
  const [firstLanguage, setFirstLanguage] = useState(initial?.firstLanguage ?? "");
  const [traditions, setTraditions] = useState(initial?.traditions ?? "");

  function fill(p: Profile) {
    setSuddenChange(p.suddenChange);
    setSupportLevel(p.supportLevel);
    setFormerWork(p.formerWork ?? "");
    setFirstLanguage(p.firstLanguage ?? "");
    setTraditions(p.traditions ?? "");
    setDisplayName(p.displayName);
    setBirthYear(String(p.birthYear));
    setHometown(p.hometown);
    setFavorites(p.favorites);
    const none = p.thingsToAvoid.length === 1 && p.thingsToAvoid[0] === "none";
    setNothingToAvoid(none);
    setAvoidText(none ? "" : p.thingsToAvoid.join("\n"));
  }

  function updateFavorite(i: number, patch: Partial<Favorite>) {
    setFavorites((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const thingsToAvoid = nothingToAvoid
      ? ["none"]
      : avoidText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    // Unanswered choices are sent as-is so the server's caregiver-friendly message explains them.
    onSubmit({
      suddenChange: suddenChange as boolean,
      supportLevel: supportLevel as SupportLevel,
      formerWork: formerWork.trim() || undefined,
      firstLanguage: firstLanguage.trim() || undefined,
      traditions: traditions.trim() || undefined,
      displayName: displayName.trim(),
      birthYear: Number(birthYear),
      hometown: hometown.trim(),
      favorites: favorites.filter((f) => f.text.trim()).map((f) => ({ ...f, text: f.text.trim() })),
      thingsToAvoid,
    });
  }

  const err = (field: keyof Profile) =>
    errors[field]?.length ? (
      <p id={`${id}-${field}-error`} className="mt-1 text-sm font-medium text-error">
        {errors[field]!.join(" ")}
      </p>
    ) : null;
  const describedBy = (field: keyof Profile, hint?: string) =>
    [hint, errors[field]?.length ? `${id}-${field}-error` : null].filter(Boolean).join(" ") || undefined;

  const inputClass =
    "mt-1 block w-full rounded-lg border border-line bg-card px-3 py-2.5 text-ink placeholder:text-muted/70 aria-[invalid=true]:border-2 aria-[invalid=true]:border-error";

  return (
    <form onSubmit={submit} className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">A few details are enough. We don’t save these details.</p>
        <button
          type="button"
          onClick={() => fill(EXAMPLE_PROFILE)}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-accent-soft"
        >
          Fill in an example (Rosa)
        </button>
      </div>

      <fieldset aria-describedby={describedBy("suddenChange")}>
        <legend className="font-semibold">First, a safety check</legend>
        <p className="mt-1">{SUDDEN_CHANGE_QUESTION}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {[
            { value: false, label: "No" },
            { value: true, label: "Yes" },
          ].map((o) => (
            <label
              key={o.label}
              className="flex min-w-24 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-4 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name={`${id}-sudden`}
                className="size-5 accent-accent"
                checked={suddenChange === o.value}
                onChange={() => setSuddenChange(o.value)}
                required
              />
              {o.label}
            </label>
          ))}
        </div>
        {err("suddenChange")}
      </fieldset>

      <div>
        <label htmlFor={`${id}-name`} className="font-semibold">
          What do they like to be called?
        </label>
        <input
          id={`${id}-name`}
          className={inputClass}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={60}
          autoComplete="off"
          aria-invalid={Boolean(errors.displayName?.length)}
          aria-describedby={describedBy("displayName")}
        />
        {err("displayName")}
      </div>

      <fieldset aria-describedby={describedBy("supportLevel")}>
        <legend className="font-semibold">How much support do they need today?</legend>
        <p className="mt-1 text-sm text-muted">This shapes the kit. It can change from day to day.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(Object.keys(SUPPORT_LEVELS) as SupportLevel[]).map((level) => (
            <label
              key={level}
              className="flex cursor-pointer gap-3 rounded-lg border border-line bg-card p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name={`${id}-support`}
                className="mt-1 size-5 shrink-0 accent-accent"
                checked={supportLevel === level}
                onChange={() => setSupportLevel(level)}
                required
              />
              <span>
                <span className="block font-medium">{SUPPORT_LEVELS[level].label}</span>
                <span className="block text-sm text-muted">{SUPPORT_LEVELS[level].description}</span>
              </span>
            </label>
          ))}
        </div>
        {err("supportLevel")}
      </fieldset>

      <div className="grid gap-7 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-year`} className="font-semibold">
            Year of birth
          </label>
          <input
            id={`${id}-year`}
            className={inputClass}
            type="number"
            inputMode="numeric"
            min={BIRTH_YEAR_MIN}
            max={BIRTH_YEAR_MAX}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            required
            aria-invalid={Boolean(errors.birthYear?.length)}
            aria-describedby={describedBy("birthYear", `${id}-year-hint`)}
          />
          <p id={`${id}-year-hint`} className="mt-1 text-sm text-muted">
            We look at the years they were about 10 to 30.
          </p>
          {err("birthYear")}
        </div>
        <div>
          <label htmlFor={`${id}-town`} className="font-semibold">
            Where they grew up
          </label>
          <input
            id={`${id}-town`}
            className={inputClass}
            value={hometown}
            onChange={(e) => setHometown(e.target.value)}
            placeholder="City or town"
            required
            maxLength={80}
            aria-invalid={Boolean(errors.hometown?.length)}
            aria-describedby={describedBy("hometown")}
          />
          {err("hometown")}
        </div>
      </div>

      <fieldset>
        <legend className="font-semibold">Favorites they still remember</legend>
        <p className="mt-1 text-sm text-muted">
          1 to {MAX_FAVORITES}. Something from when they were young works best.
        </p>
        <div className="mt-3 space-y-3">
          {favorites.map((f, i) => (
            <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
              <label className="sr-only" htmlFor={`${id}-fav-${i}`}>
                Favorite {i + 1}
              </label>
              <input
                id={`${id}-fav-${i}`}
                className={`${inputClass} mt-0 min-w-0 flex-1 basis-full sm:basis-auto`}
                value={f.text}
                onChange={(e) => updateFavorite(i, { text: e.target.value })}
                placeholder="e.g. Frank Sinatra"
                required={i === 0}
                maxLength={80}
                aria-invalid={Boolean(errors.favorites?.length)}
                aria-describedby={describedBy("favorites")}
              />
              <label className="sr-only" htmlFor={`${id}-kind-${i}`}>
                Type of favorite {i + 1}
              </label>
              <select
                id={`${id}-kind-${i}`}
                className="flex-1 rounded-lg border border-line bg-card px-3 py-2.5 sm:flex-none"
                value={f.kind}
                onChange={(e) => updateFavorite(i, { kind: e.target.value as FavoriteKind })}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {favorites.length > 1 && (
                <button
                  type="button"
                  onClick={() => setFavorites((fs) => fs.filter((_, j) => j !== i))}
                  className="rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-accent-soft"
                  aria-label={`Remove favorite ${i + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {favorites.length < MAX_FAVORITES && (
          <button
            type="button"
            onClick={() => setFavorites((fs) => [...fs, { text: "", kind: "artist" }])}
            className="mt-3 text-sm font-semibold text-accent underline underline-offset-4"
          >
            + Add another favorite
          </button>
        )}
        {err("favorites")}
      </fieldset>

      <div>
        <label htmlFor={`${id}-avoid`} className="font-semibold">
          Things to avoid
        </label>
        <p id={`${id}-avoid-hint`} className="mt-1 text-sm text-muted">
          Topics, songs or places that could upset them. One per line. We also try to screen out titles
          about illness, dementia, death, war or mature content.
        </p>
        <textarea
          id={`${id}-avoid`}
          className={`${inputClass} min-h-24 disabled:opacity-50`}
          value={avoidText}
          onChange={(e) => setAvoidText(e.target.value)}
          disabled={nothingToAvoid}
          required={!nothingToAvoid}
          placeholder="e.g. hospitals, a particular sad song"
          aria-invalid={Boolean(errors.thingsToAvoid?.length)}
          aria-describedby={describedBy("thingsToAvoid", `${id}-avoid-hint`)}
        />
        <label className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={nothingToAvoid}
            onChange={(e) => setNothingToAvoid(e.target.checked)}
          />
          Nothing to avoid that I know of
        </label>
        {err("thingsToAvoid")}
      </div>

      <details className="rounded-lg border border-line bg-card p-4" open={Boolean(formerWork || firstLanguage || traditions)}>
        <summary className="cursor-pointer font-semibold">More about them (optional)</summary>
        <p className="mt-2 text-sm text-muted">Helps make the questions personal. Used for this kit only, not saved.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-work`} className="font-medium">
              Work they did
            </label>
            <input
              id={`${id}-work`}
              className={inputClass}
              value={formerWork}
              onChange={(e) => setFormerWork(e.target.value)}
              placeholder="e.g. teacher, ran the family farm"
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor={`${id}-lang`} className="font-medium">
              First language
            </label>
            <input
              id={`${id}-lang`}
              className={inputClass}
              value={firstLanguage}
              onChange={(e) => setFirstLanguage(e.target.value)}
              placeholder="e.g. Polish"
              maxLength={40}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-trad`} className="font-medium">
              Traditions or faith that matter to them
            </label>
            <input
              id={`${id}-trad`}
              className={inputClass}
              value={traditions}
              onChange={(e) => setTraditions(e.target.value)}
              placeholder="e.g. Sunday hymns, Diwali"
              maxLength={80}
            />
          </div>
        </div>
        {err("formerWork")}
        {err("firstLanguage")}
        {err("traditions")}
      </details>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-accent px-6 py-3.5 text-lg font-semibold text-accent-ink disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Putting the kit together…" : "Build the session kit"}
      </button>
    </form>
  );
}
