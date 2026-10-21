// One Upstash Redis client for the app, or null when none is configured (local runs).
// Vercel's Upstash integration sets the KV_* names; a store made on upstash.com uses UPSTASH_*.

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
