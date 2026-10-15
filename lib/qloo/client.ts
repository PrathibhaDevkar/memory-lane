// Thin client for the Qloo hackathon API. Server-side only: the key comes from the environment
// and travels in a header, never in the URL.
//
// It never throws. A failed call comes back as { ok: false, ... } so the kit can show an honest
// gap (D6) instead of crashing or making something up.

import type { QlooEntity } from "./types";

const BASE = "https://hackathon.api.qloo.com";
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60 * 60 * 1000;
// The hackathon API rate-limits bursts: 5 parallel calls got a 429 on Oct 14. Callers can still
// ask for several lookups at once; they queue here.
const MAX_IN_FLIGHT = 2;
const MAX_ATTEMPTS = 3;

export type QlooResult =
  | { ok: true; status: number; url: string; ms: number; cached: boolean; entities: QlooEntity[] }
  | { ok: false; status: number | null; url: string; ms: number; error: string };

type Params = Record<string, string | number | undefined>;

const cache = new Map<string, { at: number; entities: QlooEntity[] }>();

let inFlight = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  // A freed slot is handed straight to the next waiter, so a newcomer can't slip in between.
  if (inFlight < MAX_IN_FLIGHT) inFlight++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else inFlight--;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Wait before retrying: Qloo's Retry-After if given (capped at 5 s), else 1 s, then 2 s. */
function backoffMs(res: Response | null, attempt: number) {
  const header = Number(res?.headers.get("retry-after"));
  return Number.isFinite(header) && header > 0 ? Math.min(header * 1000, 5000) : 1000 * 2 ** attempt;
}

/** Clears the response cache (tests). */
export function clearQlooCache() {
  cache.clear();
}

export async function qlooGet(
  path: "/search" | "/v2/insights",
  params: Params,
  // deadline: epoch ms after which no attempt starts or keeps running (the kit's time budget).
  opts: { fetchImpl?: typeof fetch; apiKey?: string; deadline?: number } = {},
): Promise<QlooResult> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const where = url.pathname + url.search;

  const hit = cache.get(where);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ok: true, status: 200, url: where, ms: 0, cached: true, entities: hit.entities };
  }

  const apiKey = opts.apiKey ?? process.env.QLOO_API_KEY;
  if (!apiKey) return { ok: false, status: null, url: where, ms: 0, error: "QLOO_API_KEY is not set" };
  const doFetch = opts.fetchImpl ?? fetch;

  const started = Date.now();
  const deadline = opts.deadline ?? Infinity;
  return withSlot(async () => {
    let last: QlooResult | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const left = deadline - Date.now();
      if (left <= 0) return last ?? { ok: false, status: null, url: where, ms: Date.now() - started, error: "Out of time for this kit" };
      let res: Response | null = null;
      try {
        res = await doFetch(url, {
          headers: { "X-Api-Key": apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, left)),
        });
        const body = await res.json().catch(() => null);
        const ms = Date.now() - started;
        if (res.ok) {
          const entities = rawEntities(body).map(normalize);
          cache.set(where, { at: Date.now(), entities });
          return { ok: true, status: res.status, url: where, ms, cached: false, entities } satisfies QlooResult;
        }
        last = { ok: false, status: res.status, url: where, ms, error: errorText(body, res.status) };
        // 429 (slow down) and 5xx are worth another try; other 4xx mean our request was wrong.
        if (res.status !== 429 && res.status < 500) break;
      } catch (err) {
        const timedOut = err instanceof Error && err.name === "TimeoutError";
        last = { ok: false, status: null, url: where, ms: Date.now() - started, error: timedOut ? "Qloo timed out" : "Could not reach Qloo" };
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        const wait = backoffMs(res, attempt);
        if (Date.now() + wait >= deadline) break; // no time left for another try
        await sleep(wait);
      }
    }
    return last!;
  });
}

// /search returns results as a plain list; /v2/insights nests them under results.entities.
function rawEntities(body: unknown): RawEntity[] {
  const results = (body as { results?: unknown })?.results;
  if (Array.isArray(results)) return results as RawEntity[];
  return ((results as { entities?: RawEntity[] })?.entities ?? []) as RawEntity[];
}

function errorText(body: unknown, status: number): string {
  const msg = (body as { errors?: { message?: string }[] })?.errors?.[0]?.message;
  return msg ? `Qloo ${status}: ${msg}` : `Qloo returned ${status}`;
}

type RawEntity = {
  entity_id: string;
  name: string;
  type?: string;
  properties?: Record<string, unknown> & {
    primary_genre?: { id?: string };
    specialty_dishes?: { id: string; name: string }[];
    keywords?: unknown[];
  };
  tags?: { name?: string; type?: string }[];
};

const KEEP_PROPS = ["release_year", "content_rating", "plot_themes_description", "description", "short_description"] as const;

/** Qloo entity → the slim shape in lib/qloo/types.ts (same as scripts/qloo-recheck.mjs trim()). */
export function normalize(e: RawEntity): QlooEntity {
  const p = e.properties ?? {};
  const properties: QlooEntity["properties"] = {};
  for (const k of KEEP_PROPS) if (p[k] != null) (properties as Record<string, unknown>)[k] = p[k];
  if (p.primary_genre?.id) properties.primary_genre = p.primary_genre.id;
  if (p.specialty_dishes) properties.specialty_dishes = p.specialty_dishes.map((d) => ({ id: d.id, name: d.name }));
  const tagNames = (re: RegExp) => [...new Set((e.tags ?? []).filter((t) => re.test(t.type ?? "")).map((t) => t.name ?? ""))].filter(Boolean);
  return {
    entity_id: e.entity_id,
    name: e.name,
    type: e.type,
    properties,
    genres: tagNames(/^urn:tag:genre/),
    keywords: [...new Set([...tagNames(/^urn:tag:keyword/), ...(p.keywords ?? []).map(String)])],
  };
}
