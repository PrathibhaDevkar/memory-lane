// One Upstash Redis client for the app, or null when none is configured (local runs).
// Vercel's Upstash integration sets the KV_* names; a store made on upstash.com uses UPSTASH_*.

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

// Preview builds and the live site share one store, so every key names its environment: a test on a
// preview can't fill production's example caches, use up its limits or add to its daily totals.
const ENVIRONMENT = process.env.VERCEL_ENV || "local";

/** A Redis key for this environment, such as "ml:production:visitor". */
export const key = (name: string) => `ml:${ENVIRONMENT}:${name}`;
