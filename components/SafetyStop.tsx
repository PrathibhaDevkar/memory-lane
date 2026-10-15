// Shown instead of a kit when the caregiver reports a sudden change (D9). Calm, clear, and with
// one next step. No activity is offered.

import type { SafetyStop as SafetyStopData } from "@/lib/types";

export function SafetyStop({ stop }: { stop: SafetyStopData }) {
  return (
    <section role="alert" aria-labelledby="stop-title" className="rounded-2xl border-2 border-note-line bg-note p-6 sm:p-8">
      <h2 id="stop-title" className="font-serif text-3xl font-semibold">
        Let&apos;s pause today&apos;s session for {stop.profile.displayName}
      </h2>
      <p className="mt-4 text-lg">{stop.message}</p>
      <p className="mt-4 text-sm text-muted">
        Memory Lane supports activities. It can&apos;t tell what a change means, and it gives no medical advice.
      </p>
    </section>
  );
}
