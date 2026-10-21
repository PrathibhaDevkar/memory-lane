import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearQlooCache, normalize, qlooGet } from "@/lib/qloo/client";

const raw = {
  entity_id: "E1",
  name: "Designing Woman",
  type: "urn:entity",
  properties: {
    release_year: 1957,
    content_rating: "Approved",
    plot_themes_description: "A mismatched marriage.",
    image: { url: "https://example.com/big.jpg" }, // dropped
    primary_genre: { id: "urn:tag:genre:place:museum", name: "Museum", akas: [] },
    specialty_dishes: [{ id: "urn:tag:specialty_dish:place:pie", name: "Pie", extra: 1 }],
    keywords: ["Fashion"],
  },
  tags: [
    { id: "g", name: "Comedy", type: "urn:tag:genre:media" },
    { id: "k", name: "Broadway", type: "urn:tag:keyword:media" },
    { id: "s", name: "Glamorous", type: "urn:tag:style:qloo" }, // dropped
  ],
};

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("normalize", () => {
  it("keeps only the fields Memory Lane reads", () => {
    expect(normalize(raw)).toEqual({
      entity_id: "E1",
      name: "Designing Woman",
      type: "urn:entity",
      properties: {
        release_year: 1957,
        content_rating: "Approved",
        plot_themes_description: "A mismatched marriage.",
        primary_genre: "urn:tag:genre:place:museum",
        specialty_dishes: [{ id: "urn:tag:specialty_dish:place:pie", name: "Pie" }],
      },
      genres: ["Comedy"],
      keywords: ["Broadway", "Fashion"],
    });
  });
});

describe("qlooGet", () => {
  beforeEach(() => clearQlooCache());

  it("sends the key in a header, never in the URL, and reads both response shapes", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).not.toContain("secret");
      expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe("secret");
      return String(url).includes("/search") ? ok({ results: [raw] }) : ok({ results: { entities: [raw] } });
    });
    const search = await qlooGet("/search", { query: "x" }, { fetchImpl, apiKey: "secret" });
    const insights = await qlooGet("/v2/insights", { "filter.type": "urn:entity:movie" }, { fetchImpl, apiKey: "secret" });
    expect(search.ok && search.entities[0].name).toBe("Designing Woman");
    expect(insights.ok && insights.entities[0].name).toBe("Designing Woman");
  });

  it("caches repeat calls", async () => {
    const fetchImpl = vi.fn(async () => ok({ results: { entities: [raw] } }));
    await qlooGet("/v2/insights", { a: 1 }, { fetchImpl, apiKey: "k" });
    const second = await qlooGet("/v2/insights", { a: 1 }, { fetchImpl, apiKey: "k" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.ok && second.cached).toBe(true);
  });

  it("retries once on a server error", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok({}, 503)).mockResolvedValueOnce(ok({ results: { entities: [raw] } }));
    const r = await qlooGet("/v2/insights", { b: 1 }, { fetchImpl, apiKey: "k" });
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("waits and retries on a 429 (rate limit)", async () => {
    const limited = new Response("{}", { status: 429, headers: { "retry-after": "0.01" } });
    const fetchImpl = vi.fn().mockResolvedValueOnce(limited).mockResolvedValueOnce(ok({ results: { entities: [raw] } }));
    const r = await qlooGet("/v2/insights", { r: 1 }, { fetchImpl, apiKey: "k" });
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never has more than 2 calls in flight", async () => {
    let now = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      peak = Math.max(peak, ++now);
      await new Promise((r) => setTimeout(r, 10));
      now--;
      return ok({ results: { entities: [raw] } });
    });
    await Promise.all([1, 2, 3, 4, 5].map((i) => qlooGet("/v2/insights", { p: i }, { fetchImpl, apiKey: "k" })));
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(peak).toBe(2);
  });

  it("starts no attempt, and schedules no retry, past the kit's deadline", async () => {
    const fetchImpl = vi.fn(async () => ok({}, 503));
    const past = await qlooGet("/v2/insights", { d: 1 }, { fetchImpl, apiKey: "k", deadline: Date.now() - 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(past).toMatchObject({ ok: false, error: "Out of time for this kit" });

    // 503s are normally retried after 1 s; with 200 ms left there is no time for that.
    const started = Date.now();
    const r = await qlooGet("/v2/insights", { d: 2 }, { fetchImpl, apiKey: "k", deadline: Date.now() + 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("does not retry a 400, and returns Qloo's message instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => ok({ errors: [{ message: "at least one valid signal or filter is required" }] }, 400));
    const r = await qlooGet("/v2/insights", { c: 1 }, { fetchImpl, apiKey: "k" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, status: 400, error: "Qloo 400: at least one valid signal or filter is required" });
  });

  it("turns network failures into a gap, not an exception", { timeout: 10_000 }, async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const r = await qlooGet("/v2/insights", { d: 1 }, { fetchImpl, apiKey: "k" });
    expect(r).toMatchObject({ ok: false, status: null, error: "Could not reach Qloo" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("reports a missing key without calling Qloo", async () => {
    const fetchImpl = vi.fn();
    const r = await qlooGet("/v2/insights", { e: 1 }, { fetchImpl, apiKey: "" });
    expect(r).toMatchObject({ ok: false, error: "QLOO_API_KEY is not set" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
