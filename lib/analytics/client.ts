// Sends browser events to PostHog, once instrumentation-client.ts has started it. Until then, or
// when analytics are off (no key, Do Not Track, a blocker), track() does nothing and the app
// works the same.

import type { PostHog } from "posthog-js";
import { CLIENT_EVENTS, pick, type ClientEvents } from "./events";

let posthog: Pick<PostHog, "capture"> | null = null;

export function setAnalyticsClient(client: Pick<PostHog, "capture"> | null) {
  posthog = client;
}

/** One event from lib/analytics/events.ts, with only its listed properties. */
export function track<E extends keyof ClientEvents>(event: E, properties: ClientEvents[E]) {
  if (!posthog) return;
  try {
    posthog.capture(event, pick(CLIENT_EVENTS[event], properties));
  } catch {
    // Analytics never get in the way of the session.
  }
}
