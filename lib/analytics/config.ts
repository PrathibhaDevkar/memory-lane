// PostHog settings for Memory Lane (docs/analytics.md). Imported by next.config.ts too, so it has no
// runtime imports.

import type { PostHogConfig } from "posthog-js";

/** Analytics are off unless this is set (the project's public API key, phc_…). */
export const posthogKey = () => process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || undefined;

/** PostHog Cloud region: "us" (default) or "eu". */
export const posthogRegion = (): "us" | "eu" => (process.env.NEXT_PUBLIC_POSTHOG_REGION === "eu" ? "eu" : "us");

export function posthogHosts(region = posthogRegion()) {
  return {
    ingest: `https://${region}.i.posthog.com`,
    assets: `https://${region}-assets.i.posthog.com`,
    ui: `https://${region}.posthog.com`,
  };
}

/** Browser events go through this path on our own site (next.config.ts), so blockers don't drop them. */
export const PROXY_PATH = "/ingest";

/**
 * posthog-js options. Cookieless: nothing is stored on the device, and PostHog counts daily unique
 * visitors from a hash with a salt it deletes every day (the project setting "Cookieless server hash
 * mode" must be on, or PostHog ignores these events). Only our own events and pageviews are sent:
 * no autocapture (it would read page text, and kits show a person's favorites), no screen
 * recording, heatmaps, surveys, error capture or extra scripts.
 */
export function posthogInitOptions(): Partial<PostHogConfig> {
  return {
    api_host: PROXY_PATH,
    ui_host: posthogHosts().ui,
    defaults: "2026-05-30",
    cookieless_mode: "always",
    person_profiles: "never",
    internal_or_test_user_hostname: null,
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    disable_capture_url_hashes: true,
  };
}
