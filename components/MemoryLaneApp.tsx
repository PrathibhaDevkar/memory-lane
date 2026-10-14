"use client";

// One page, two views (form → kit). The profile lives only in memory: never in the URL
// (it would land in history and shared links) and never in browser storage.

import { useEffect, useRef, useState } from "react";
import { KitSchema, type Kit, type Profile } from "@/lib/types";
import { IntakeForm, type FieldErrors } from "./IntakeForm";
import { KitView } from "./KitView";

type State =
  | { view: "form"; busy: boolean; errors?: FieldErrors; message?: string }
  | { view: "kit"; kit: Kit };

export function MemoryLaneApp() {
  const [state, setState] = useState<State>({ view: "form", busy: false });
  const [lastProfile, setLastProfile] = useState<Profile | undefined>();
  const kitRef = useRef<HTMLDivElement>(null);

  // Move focus to the kit when it appears, so screen-reader and keyboard users land on it.
  useEffect(() => {
    if (state.view === "kit") {
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
      const parsed = KitSchema.safeParse(body);
      if (!parsed.success) {
        setState({ view: "form", busy: false, message: "The kit came back in an unexpected shape. Please try again." });
        return;
      }
      setState({ view: "kit", kit: parsed.data });
    } catch {
      setState({ view: "form", busy: false, message: "Couldn't reach Memory Lane. Check the connection and try again." });
    }
  }

  if (state.view === "kit") {
    return (
      <div ref={kitRef} tabIndex={-1} className="outline-none">
        <div className="no-print mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setState({ view: "form", busy: false })}
            className="rounded-full border border-line px-4 py-2 font-medium hover:bg-accent-soft"
          >
            ← Change details
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-line px-4 py-2 font-medium hover:bg-accent-soft"
          >
            Print kit
          </button>
        </div>
        <KitView kit={state.kit} />
      </div>
    );
  }

  return (
    <div>
      <div aria-live="polite" className="min-h-0">
        {state.message && (
          <p role="alert" className="mb-6 rounded-xl border border-error/40 px-4 py-3 font-medium text-error">
            {state.message}
          </p>
        )}
        {state.busy && <p className="sr-only">Putting the kit together…</p>}
      </div>
      <IntakeForm
        key={lastProfile ? "edit" : "new"}
        initial={lastProfile}
        errors={state.errors}
        busy={state.busy}
        onSubmit={build}
      />
    </div>
  );
}
