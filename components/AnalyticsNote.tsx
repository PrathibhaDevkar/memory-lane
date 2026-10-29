import { posthogKey } from "@/lib/analytics/config";

// Every event and property is listed there. main only gets the file when PR #2 merges, so this links
// the working branch, which is kept.
export const ANALYTICS_DOC_URL = "https://github.com/PrathibhaDevkar/memory-lane/blob/main/docs/analytics.md";

/** Says on screen what analytics count. Shown only when they're on (NEXT_PUBLIC_POSTHOG_KEY is set). */
export function AnalyticsNote() {
  if (!posthogKey()) return null;
  return (
    <p className="no-print">
      We count which screens and buttons are used, without cookies and without anything you type.{" "}
      <a href={ANALYTICS_DOC_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
        What we count ↗<span className="sr-only"> (opens a new tab)</span>
      </a>
    </p>
  );
}
