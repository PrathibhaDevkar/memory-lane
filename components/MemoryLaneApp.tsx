"use client";

// One page: form → kit (or safety stop) → session → note. The profile and session log live only in
// memory: never in the URL (it would land in history and shared links), never in browser storage,
// and the log is never sent to the server (D11).

import { useEffect, useRef, useState } from "react";
import { DEMOS } from "@/lib/demos";
import type { SessionLog } from "@/lib/session";
import { kitAsText, whatsappUrl } from "@/lib/share";
import { KitResponseSchema, type Kit, type Profile, type SafetyStop as SafetyStopData } from "@/lib/types";
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
  const kitRef = useRef<HTMLDivElement>(null);

  // Move focus to the kit when it appears, so screen-reader and keyboard users land on it.
  useEffect(() => {
    if (state.view !== "form") {
      kitRef.current?.focus();
      window.scrollTo({ top: 0 });
    }
  }, [state.view]);

  async function build(profile: Profile) {
    setLastProfile(profile);
    setState({ view: "form", busy: true });
    try {
      const res = await fetch("/api/kit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 400) {
        setState({ view: "form", busy: false, errors: body?.issues, message: "Please check the highlighted fields." });
        return;
      }
      if (!res.ok) {
        const message =
          res.status === 429
            ? "Too many kits in a short time. Please try again in a little while."
            : "Something went wrong on our side. Please try again.";
        setState({ view: "form", busy: false, message });
        return;
      }
      // Validate the response against the shared contract before showing it.
      const parsed = KitResponseSchema.safeParse(body);
      if (!parsed.success) {
        setState({ view: "form", busy: false, message: "The kit came back in an unexpected shape. Please try again." });
        return;
      }
      setState(parsed.data.mode === "safety_stop" ? { view: "stop", stop: parsed.data } : { view: "kit", kit: parsed.data });
    } catch {
      setState({ view: "form", busy: false, message: "Couldn't reach Memory Lane. Check the connection and try again." });
    }
  }

  if (state.view === "stop") {
    return (
      <div ref={kitRef} tabIndex={-1} className="outline-none">
        <div className="no-print mb-6">
          <button
            type="button"
            onClick={() => setState({ view: "form", busy: false })}
            className="rounded-full border border-line px-4 py-2 font-medium hover:bg-accent-soft"
          >
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
        <SessionMode kit={kit} onEnd={(log) => setState({ view: "note", kit, log })} />
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
            const base = lastProfile ?? kit.profile;
            const avoid = [...base.thingsToAvoid.filter((t) => t !== "none"), ...extraAvoid.filter((t) => !base.thingsToAvoid.includes(t))];
            setLastProfile({ ...base, thingsToAvoid: avoid.length ? avoid : ["none"] });
            setState({
              view: "form",
              busy: false,
              askSafetyAgain: true,
              notice: extraAvoid.length
                ? `Ready for the next kit. Added to things to avoid: ${extraAvoid.join(", ")}. Check today's answers before building.`
                : "Ready for the next kit. Check today's answers before building.",
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
            onClick={() => setState({ view: "session", kit })}
            className="rounded-full bg-accent px-5 py-2 font-semibold text-accent-ink"
          >
            Start session
          </button>
          <a
            href={whatsappUrl(kitAsText(kit))}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line px-4 py-2 font-medium hover:bg-accent-soft"
          >
            Send to WhatsApp ↗<span className="sr-only"> (opens WhatsApp in a new tab)</span>
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-line px-4 py-2 font-medium hover:bg-accent-soft"
          >
            Print kit
          </button>
          <button
            type="button"
            onClick={() => setState({ view: "form", busy: false })}
            className="rounded-full border border-line px-4 py-2 font-medium hover:bg-accent-soft"
          >
            ← Change details
          </button>
        </div>
        <KitView kit={kit} />
      </div>
    );
  }

  return (
    <div>
      <section aria-labelledby="demo-title" className="no-print mb-8 rounded-2xl border border-line bg-card p-5">
        <h2 id="demo-title" className="font-semibold">
          Try a demo
        </h2>
        <p className="mt-1 text-sm text-muted">Fictional people with saved kits. Opens instantly; nothing is sent.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {DEMOS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() =>
                setState(d.response.mode === "safety_stop" ? { view: "stop", stop: d.response } : { view: "kit", kit: d.response })
              }
              className="rounded-xl border border-line px-4 py-2.5 text-left hover:bg-accent-soft"
            >
              <span className="block font-medium">{d.name}</span>
              <span className="block text-sm text-muted">{d.description}</span>
            </button>
          ))}
        </div>
      </section>

      <div aria-live="polite" className="min-h-0">
        {state.message && (
          <p role="alert" className="mb-6 rounded-xl border border-error/40 px-4 py-3 font-medium text-error">
            {state.message}
          </p>
        )}
        {state.notice && <p className="mb-6 rounded-xl border border-note-line bg-note px-4 py-3 font-medium">{state.notice}</p>}
        {state.busy && <p className="sr-only">Putting the kit together…</p>}
      </div>
      <IntakeForm
        key={lastProfile ? "edit" : "new"}
        initial={lastProfile}
        askSafetyAgain={state.askSafetyAgain}
        errors={state.errors}
        busy={state.busy}
        onSubmit={build}
      />
    </div>
  );
}
