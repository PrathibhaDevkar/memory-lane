// The analytics events Memory Lane sends to PostHog, and the only properties each one may carry
// (docs/analytics.md). Product rule 6: nothing about a real person is stored or logged. So no event
// carries anything the caregiver typed, the person's details or support level, what a kit holds,
// session reactions, or the safety check (a safety stop sends no event at all). track() and the
// server capture send only the names and properties listed here and drop anything else.

/** Browser events: how the app is used. */
export type ClientEvents = {
  demo_opened: { demo: string }; // a fictional demo person: "rosa" or "margaret"
  example_filled: Record<string, never>;
  form_action: { action: "add_favorite" | "remove_favorite" | "more_about_opened" };
  kit_shown: { source: "live" | "cached" | "fixture"; seconds: number };
  kit_failed: { reason: "check_fields" | "limit" | "paused" | "server" | "shape" | "network" };
  kit_action: { action: "start_session" | "whatsapp" | "print" | "change_details" | "back_to_kit" | "compare" };
  comparison_shown: { source: "live" | "cached" };
  comparison_failed: { reason: "not_live" | "limit" | "paused" | "server" | "shape" | "network" };
  media_opened: { where: "kit" | "session"; service: "spotify" | "youtube" };
  how_made_opened: Record<string, never>;
  session_started: Record<string, never>;
  session_ended: Record<string, never>;
  note_action: { action: "copy" | "whatsapp" | "print" | "build_next" | "back_to_kit" };
  text_size_changed: { size: "standard" | "large" | "largest" };
  read_aloud: Record<string, never>; // a session card read aloud (not which card)
};

/** Server events: what each kit cost, and why a live kit was refused. */
export type ServerEvents = {
  kit_built: {
    source: "live" | "reused" | "fixture";
    model?: string;
    effort?: string;
    claude_calls?: number;
    input_tokens?: number;
    cache_write_tokens?: number;
    cache_read_tokens?: number;
    output_tokens?: number;
    cost_usd?: number | null;
    audit_passed?: boolean;
    sections_filled?: number;
    removed?: number;
    alerts?: number;
    alert_kinds?: string[];
    build_seconds?: number;
    today_tokens?: number;
    today_usd?: number;
  };
  kit_refused: { reason: "not_configured" | "visitor_limit" | "daily_limit" | "paused" | "claude_busy" | "claude_error" | "error" };
  // Claude on its own, checked against Qloo (lib/compare.ts): what it cost.
  comparison_built: { source: "live" | "reused"; model?: string; input_tokens?: number; output_tokens?: number; cost_usd?: number | null; build_seconds?: number };
  comparison_refused: { reason: "not_configured" | "visitor_limit" | "daily_limit" | "paused" | "claude_busy" | "claude_error" | "error" };
};

type Allowed<T> = { [E in keyof T]: readonly (keyof T[E])[] };

export const CLIENT_EVENTS: Allowed<ClientEvents> = {
  demo_opened: ["demo"],
  example_filled: [],
  form_action: ["action"],
  kit_shown: ["source", "seconds"],
  kit_failed: ["reason"],
  kit_action: ["action"],
  comparison_shown: ["source"],
  comparison_failed: ["reason"],
  media_opened: ["where", "service"],
  how_made_opened: [],
  session_started: [],
  session_ended: [],
  note_action: ["action"],
  text_size_changed: ["size"],
  read_aloud: [],
};

export const SERVER_EVENTS: Allowed<ServerEvents> = {
  kit_built: [
    "source",
    "model",
    "effort",
    "claude_calls",
    "input_tokens",
    "cache_write_tokens",
    "cache_read_tokens",
    "output_tokens",
    "cost_usd",
    "audit_passed",
    "sections_filled",
    "removed",
    "alerts",
    "alert_kinds",
    "build_seconds",
    "today_tokens",
    "today_usd",
  ],
  kit_refused: ["reason"],
  comparison_built: ["source", "model", "input_tokens", "output_tokens", "cost_usd", "build_seconds"],
  comparison_refused: ["reason"],
};

/** Only the listed properties, and only plain values (no objects that could smuggle text in). */
export function pick(allowed: readonly PropertyKey[], properties: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.includes(key) || value === undefined) continue;
    const plain = value === null || ["string", "number", "boolean"].includes(typeof value);
    const words = Array.isArray(value) && value.every((v) => typeof v === "string");
    if (plain || words) out[key] = value;
  }
  return out;
}
