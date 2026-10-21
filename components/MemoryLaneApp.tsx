"use client";

// One page: form → kit (or safety stop) → session → note. The profile and session log live only in
// memory: never in the URL (it would land in history and shared links), never in browser storage,
// and the log is never sent to the server (D11). Analytics (lib/analytics/events.ts) say which
// screens and buttons are used, never what is in them; a safety stop sends no event.

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics/client";
import { DEMOS } from "@/lib/demos";
import type { SessionLog } from "@/lib/session";
import { kitAsText, whatsappUrl } from "@/lib/share";
import { KitResponseSchema, MAX_THINGS_TO_AVOID, type Kit, type Profile, type SafetyStop as SafetyStopData } from "@/lib/types";
import { IntakeForm, type FieldErrors } from "./IntakeForm";
import { KitView } from "./KitView";
import { SafetyStop } from "./SafetyStop";
import { SessionMode } from "./SessionMode";
import { SessionNote } from "./SessionNote";

type State =
  | { view: "form"; busy: boolean; errors?: FieldErrors; message?: string; notice?: string; askSafetyAgain?: boolean }
  | { view: "kit"; kit: Kit }
  | { view: "stop"; stop: SafetyStopData }
  | { view: "session"; kit: Kit }
  | { view: "note"; kit: Kit; log: SessionLog };

export function MemoryLaneApp() {
  const [state, setState] = useState<State>({ view: "form", busy: false });
  const [lastProfile, setLastProfile] = useState<Profile | undefined>();
  // The kit last shown, so going back to the form never loses it: one tap returns to it.
  const [lastKit, setLastKit] = useState<Kit | undefined>();
  const kitRef = useRef<HTMLDivElement>(null);

  function showKit(kit: Kit) {
    setLastKit(kit);
    setState({ view: "kit", kit });
  }

  // Move focus to the kit when it appears, so screen-reader and keyboard users land on it. A view
  // that places focus itself (session mode focuses its first card, and runs its effect first) keeps it.
  useEffect(() => {
    if (state.view !== "form") {
      if (!kitRef.current?.contains(document.activeElement)) kitRef.current?.focus();
      window.scrollTo({ top: 0 });
    }
  }, [state.view]);

  async function build(profile: Profile) {
    setLastProfile(profile);
    setState({ view: "form", busy: true });
    const started = performance.now();
    try {
      const res = await fetch("/api/kit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 400) {
        track("kit_failed", { reason: "check_fields" });
        setState({ view: "form", busy: false, errors: body?.issues, message: "Please check the highlighted fields." });
        return;
      }
      if (!res.ok) {
        // Limits and paused live kits come with the server's own wording.
        const fromServer = (res.status === 429 || res.status === 503) && typeof body?.error === "string" ? body.error : null;
        const message =
          fromServer ??
          (res.status === 429
            ? "Too many kits in a short time. Please try again in a little while."
            : "Something went wrong on our side. Please try again.");
        track("kit_failed", { reason: res.status === 429 ? "limit" : res.status === 503 ? "paused" : "server" });
        setState({ view: "form", busy: false, message });
        return;
      }
      // Validate the response against the shared contract before showing it.
      const parsed = KitResponseSchema.safeParse(body);
      if (!parsed.success) {
        track("kit_failed", { reason: "shape" });
        setState({ view: "form", busy: false, message: "The kit came back in an unexpected shape. Please try again." });
        return;
      }
      if (parsed.data.mode === "safety_stop") {
        setState({ view: "stop", stop: parsed.data });
        return;
      }
      track("kit_shown", { source: parsed.data.provenance.kind, seconds: Math.round((performance.now() - started) / 100) / 10 });
      showKit(parsed.data);
    } catch {
      track("kit_failed", { reason: "network" });
      setState({ view: "form", busy: false, message: "Couldn't reach Memory Lane. Check the connection and try again." });
    }
  }

  if (state.view === "stop") {
    return (
      <div ref={kitRef} tabIndex={-1} className="outline-none">
        <div className="no-print mb-6">
          <button type="button" onClick={() => setState({ view: "form", busy: false })} className="btn btn-secondary">
            ← Back
          </button>
        </div>
        <SafetyStop stop={state.stop} />
      </div>
    );
  }

  if (state.view === "session") {
    const kit = state.kit;
    return (
      <div ref={kitRef} tabIndex={-1} className="outline-none">
        <SessionMode
          kit={kit}
          onEnd={(log) => {
            track("session_ended", {});
            setState({ view: "note", kit, log });
          }}
          onBack={() => setState({ view: "kit", kit })}
        />
      </div>
    );
  }

  if (state.view === "note") {
    const kit = state.kit;
    return (
      <div ref={kitRef} tabIndex={-1} className="outline-none">
        <SessionNote
          kit={kit}
          log={state.log}
          onBackToKit={() => setState({ view: "kit", kit })}
          onBuildNext={(extraAvoid) => {
            // Back to the form, ready to review: the support level can change from day to day.
            // The next kit is for the person this session was about, even after a demo.
            const base = kit.profile;
            const current = base.thingsToAvoid.filter((t) => t !== "none");
            // Stay within the form's limit; anything that doesn't fit is named in the notice.
            const fresh = extraAvoid.filter((t) => !current.includes(t));
            const added = fresh.slice(0, Math.max(0, MAX_THINGS_TO_AVOID - current.length));
            const avoid = [...current, ...added];
            setLastProfile({ ...base, thingsToAvoid: avoid.length ? avoid : ["none"] });
            const skipped = fresh.slice(added.length);
            setState({
              view: "form",
              busy: false,
              askSafetyAgain: true,
              notice: [
                "Ready for the next kit.",
                added.length ? `Added to things to avoid: ${added.join(", ")}.` : "",
                skipped.length ? `The list is full (${MAX_THINGS_TO_AVOID}), so these weren't added: ${skipped.join(", ")}.` : "",
                "Check today's answers before building.",
              ]
                .filter(Boolean)
                .join(" "),
            });
          }}
        />
      </div>
    );
  }

  if (state.view === "kit") {
    const kit = state.kit;
    return (
      <div ref={kitRef} tabIndex={-1} className="outline-none">
        <div className="no-print mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              track("kit_action", { action: "start_session" });
              track("session_started", {});
              setState({ view: "session", kit });
            }}
            className="btn btn-primary px-6 text-lg"
          >
            Start session
          </button>
          <a
            href={whatsappUrl(kitAsText(kit))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("kit_action", { action: "whatsapp" })}
            className="btn btn-secondary"
          >
            Send to WhatsApp ↗<span className="sr-only"> (opens WhatsApp in a new tab)</span>
          </a>
          <button
            type="button"
            onClick={() => {
              track("kit_action", { action: "print" });
              window.print();
            }}
            className="btn btn-secondary"
          >
            Print kit
          </button>
          <button
            type="button"
            onClick={() => {
              track("kit_action", { action: "change_details" });
              setState({ view: "form", busy: false });
            }}
            className="btn btn-secondary"
          >
            ← Change details
          </button>
        </div>
        <KitView
          kit={kit}
          onMediaOpen={(service) => track("media_opened", { where: "kit", service })}
          onTraceOpen={() => track("how_made_opened", {})}
        />
      </div>
    );
  }

  return (
    <div>
      {lastKit && (
        <div className="no-print mb-6">
          <button
            type="button"
            onClick={() => {
              track("kit_action", { action: "back_to_kit" });
              showKit(lastKit);
            }}
            className="btn btn-link"
          >
            ← Back to {lastKit.profile.displayName}&apos;s kit
          </button>
        </div>
      )}

      <section aria-labelledby="demo-title" className="no-print mb-8 rounded-2xl border border-line bg-card p-5">
        <h2 id="demo-title" className="font-semibold">
          Try a demo
        </h2>
        <p className="mt-1 text-muted">Fictional people with saved kits. Opens instantly; nothing is sent.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {DEMOS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                track("demo_opened", { demo: d.id });
                if (d.response.mode === "safety_stop") setState({ view: "stop", stop: d.response });
                else showKit(d.response);
              }}
              className="min-h-12 rounded-xl border-2 border-control bg-card px-4 py-2.5 text-left hover:bg-accent-soft"
            >
              <span className="block font-semibold">{d.name}</span>
              <span className="block text-muted">{d.description}</span>
            </button>
          ))}
        </div>
      </section>

      <div aria-live="polite" className="min-h-0">
        {state.message && (
          <p role="alert" className="mb-6 rounded-xl border-2 border-error px-4 py-3 font-medium text-error">
            {state.message}
          </p>
        )}
        {state.notice && <p className="mb-6 rounded-xl border border-note-line bg-note px-4 py-3 font-medium">{state.notice}</p>}
        {state.busy && <p className="sr-only">Putting the kit together…</p>}
      </div>
      <IntakeForm
        initial={lastProfile}
        askSafetyAgain={state.askSafetyAgain}
        errors={state.errors}
        busy={state.busy}
        onSubmit={build}
      />
    </div>
  );
}
