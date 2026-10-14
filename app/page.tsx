import { MemoryLaneApp } from "@/components/MemoryLaneApp";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="no-print border-b border-line">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
          <p className="font-serif text-2xl font-semibold">Memory Lane</p>
          <p className="text-muted">Personal reminiscence sessions, put together in a minute.</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <MemoryLaneApp />
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-3xl px-4 py-5 text-sm text-muted sm:px-6">
          Memory Lane supports caregivers&apos; activities. It is not therapy and makes no medical claims. Picks
          come from Qloo&apos;s taste graph; media links open a search, nothing is embedded.
        </p>
      </footer>
    </div>
  );
}
