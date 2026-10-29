// Shown instead of a kit when the caregiver reports a sudden change (D9). Calm, clear, and with
// one next step. No activity is offered. The form shows it as soon as "Yes" is chosen, so the name
// may not be filled in yet.

export function SafetyStop({ name, message }: { name?: string; message: string }) {
  return (
    <section role="alert" aria-labelledby="stop-title" className="rounded-2xl border-2 border-note-line bg-note p-6 sm:p-8">
      <h2 id="stop-title" className="font-serif text-3xl font-semibold">
        Let&apos;s pause today&apos;s session{name ? ` for ${name}` : ""}
      </h2>
      <p className="mt-4 text-lg">{message}</p>
      <p className="mt-4 text-muted">
        Memory Lane supports activities. It can&apos;t tell what a change means, and it gives no medical advice.
      </p>
    </section>
  );
}
