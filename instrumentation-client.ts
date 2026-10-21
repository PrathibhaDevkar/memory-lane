// Starts PostHog product analytics in the browser (docs/analytics.md). Off unless
// NEXT_PUBLIC_POSTHOG_KEY is set, and off for visitors who send Do Not Track or Global Privacy
// Control. Loaded after the page, so it never delays it; if a blocker stops it, nothing changes.

import { setAnalyticsClient } from "@/lib/analytics/client";
import { posthogInitOptions, posthogKey } from "@/lib/analytics/config";

const key = posthogKey();
const optedOut = () => navigator.doNotTrack === "1" || (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

if (key && !optedOut()) {
  import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, posthogInitOptions());
      setAnalyticsClient(posthog);
    })
    .catch(() => {});
}
