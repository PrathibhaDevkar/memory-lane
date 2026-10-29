import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KitAudit } from "@/lib/agent/audit";

// posthog-node stand-in: records what would be sent.
const sent: { event: string; distinctId?: string; properties: Record<string, unknown> }[] = [];
const made: { key: string; options: Record<string, unknown> }[] = [];
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(key: string, options: Record<string, unknown>) {
      made.push({ key, options });
    }
    async captureImmediate(message: (typeof sent)[number]) {
      sent.push(message);
    }
    async shutdown() {}
  },
}));
// after(): run the callback straight away.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const { CLIENT_EVENTS, SERVER_EVENTS, pick } = await import("@/lib/analytics/events");
const { setAnalyticsClient, track } = await import("@/lib/analytics/client");
const { posthogHosts, posthogInitOptions } = await import("@/lib/analytics/config");
const { captureAfterResponse, kitBuiltProperties, refusalReason } = await import("@/lib/analytics/server");

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("analytics events (Product rule 6: nothing about a real person)", () => {
  it("lists no property that could hold a person's details, a kit's contents or a reaction", () => {
    const names = [...Object.values(CLIENT_EVENTS), ...Object.values(SERVER_EVENTS)].flat().map(String);
    const personal = /name|birth|year|town|favorite|avoid|tradition|work|language|support|level|reaction|sudden|safety|note|title|question|prompt|text|profile/i;
    expect(names.filter((n) => personal.test(n))).toEqual([]);
    // A safety stop must not be inferable either: there's no event for it.
    expect(Object.keys({ ...CLIENT_EVENTS, ...SERVER_EVENTS }).join(" ")).not.toMatch(/stop|safety/);
  });

  it("keeps only listed properties with plain values", () => {
    expect(pick(["a", "b", "c"], { a: 1, b: { nested: "Rosa" }, c: ["kit_input"], d: "Rosa" })).toEqual({ a: 1, c: ["kit_input"] });
    expect(pick(["a"], { a: [1, { x: 1 }] })).toEqual({});
  });
});

describe("track (browser)", () => {
  afterEach(() => setAnalyticsClient(null));

  it("does nothing until PostHog has started, then sends only the listed properties", () => {
    const capture = vi.fn();
    track("kit_shown", { source: "live", seconds: 9.4 });
    expect(capture).not.toHaveBeenCalled();
    setAnalyticsClient({ capture } as never);
    // An extra property slipped in by mistake is dropped.
    track("kit_shown", { source: "live", seconds: 9.4, displayName: "Rosa" } as never);
    expect(capture).toHaveBeenCalledWith("kit_shown", { source: "live", seconds: 9.4 });
  });

  it("never breaks the app if PostHog fails", () => {
    setAnalyticsClient({ capture: () => { throw new Error("blocked"); } } as never);
    expect(() => track("session_started", {})).not.toThrow();
  });
});

describe("PostHog settings", () => {
  it("are cookieless and send only our own events", () => {
    const o = posthogInitOptions();
    expect(o).toMatchObject({
      api_host: "/ingest",
      cookieless_mode: "always",
      person_profiles: "never",
      autocapture: false,
      disable_session_recording: true,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      disable_surveys: true,
      disable_external_dependency_loading: true,
    });
  });

  it("use the region chosen", () => {
    expect(posthogHosts("eu")).toEqual({ ingest: "https://eu.i.posthog.com", assets: "https://eu-assets.i.posthog.com", ui: "https://eu.posthog.com" });
    expect(posthogHosts().ingest).toBe("https://us.i.posthog.com");
  });
});

describe("server events", () => {
  beforeEach(() => {
    sent.length = 0;
    made.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("send nothing without a PostHog key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    captureAfterResponse("kit_built", { source: "fixture" });
    await flush();
    expect(made).toHaveLength(0);
  });

  it("send one event with no person profile and no visitor ID, after the response", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    captureAfterResponse("kit_refused", { reason: "visitor_limit", visitor: "203.0.113.9" } as never);
    await flush();
    expect(made[0]).toMatchObject({ key: "phc_test", options: { host: "https://us.i.posthog.com", flushAt: 1, flushInterval: 0 } });
    expect(sent).toEqual([{ event: "kit_refused", properties: { reason: "visitor_limit", $process_person_profile: false } }]);
  });

  it("describe a live kit by its token use and audit only", () => {
    const audit: KitAudit = {
      model: "claude-haiku-5-5",
      effort: "medium",
      calls: 2,
      tokens: { in: 1800, cacheWrite: 0, cacheRead: 2550, out: 2300 },
      costUsd: 0.0014,
      sectionsFilled: 4,
      questions: 2,
      removed: 1,
      passed: true,
      alerts: [],
    };
    const props = kitBuiltProperties(audit, { day: "2026-10-21", tokens: 90000, usd: 0.04, alerts: [] }, ["Kit took 3 Claude calls, over the limit of 2.", "Today's Claude cost is $1.20, over the daily limit of $1."], 12_345);
    expect(props).toMatchObject({ source: "live", claude_calls: 2, output_tokens: 2300, cost_usd: 0.0014, alerts: 2, alert_kinds: ["kit_calls", "daily_usd"], build_seconds: 12.3, today_tokens: 90000 });
    // The question count would reveal the support level, so it isn't sent.
    expect(props).not.toHaveProperty("questions");
  });

  it("name why a live kit was refused", () => {
    expect(refusalReason("Live kits aren't switched on yet. Try one of the sample kits.")).toBe("not_configured");
    expect(refusalReason("You've built 3 kits in the last hour. Try a sample kit, or come back a little later.")).toBe("visitor_limit");
    expect(refusalReason("Today's live kits are used up. The sample kits show what a full kit looks like.")).toBe("daily_limit");
  });
});
