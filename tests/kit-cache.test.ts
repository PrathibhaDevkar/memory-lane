import { beforeEach, describe, expect, it, vi } from "vitest";
import rosa from "@/fixtures/kits/rosa.json";

// An in-memory stand-in for Upstash Redis.
const store = vi.hoisted(() => new Map<string, unknown>());
const fake = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn<(key: string, value: unknown, opts?: { ex: number }) => Promise<string>>(async (key, value) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
    return "OK";
  }),
}));
vi.mock("@/lib/redis", () => ({ redis: fake }));

const { EXAMPLE_KIT_HOURS, REUSED_NOTE, isExampleProfile, reusedExampleKit, saveExampleKit } = await import("@/lib/kit-cache");
const { EXAMPLE_PROFILE } = await import("@/lib/example-profile");
const { KitSchema, ProfileSchema } = await import("@/lib/types");

const KEY = "ml:example-kit:v1";
const example = ProfileSchema.parse(EXAMPLE_PROFILE);
const live = { ...KitSchema.parse(rosa), provenance: { kind: "live" as const, generatedAt: "2026-10-19T18:40:12.000Z" } };
const gap = { status: "gap" as const, items: [], gapReason: "Nothing suitable came back." };

beforeEach(() => {
  store.clear();
  fake.get.mockClear();
  fake.set.mockClear();
});

describe("reusing the example profile's kit", () => {
  it("recognizes the example profile exactly, after the form's own cleanup", () => {
    expect(isExampleProfile(example)).toBe(true);
    expect(isExampleProfile(ProfileSchema.parse({ ...EXAMPLE_PROFILE, hometown: "  Chicago " }))).toBe(true);
    expect(isExampleProfile({ ...example, birthYear: 1943 })).toBe(false);
    expect(isExampleProfile({ ...example, thingsToAvoid: ["hospitals"] })).toBe(false);
    expect(isExampleProfile({ ...example, formerWork: "teacher" })).toBe(false);
  });

  it("keeps a good live kit for a few hours and serves it back labeled as reused", async () => {
    await saveExampleKit(example, live);
    expect(fake.set).toHaveBeenCalledWith(KEY, live, { ex: EXAMPLE_KIT_HOURS * 3600 });
    const reused = await reusedExampleKit(example);
    expect(reused?.provenance).toEqual({ kind: "cached", generatedAt: live.provenance.generatedAt, note: REUSED_NOTE });
    expect(reused?.music).toEqual(live.music);
    expect(KitSchema.safeParse(reused).success).toBe(true);
  });

  it("never stores or serves a kit for anyone else: nothing about a real person is kept", async () => {
    const someone = { ...example, displayName: "Walt" };
    await saveExampleKit(someone, live);
    expect(fake.set).not.toHaveBeenCalled();
    store.set(KEY, live);
    expect(await reusedExampleKit(someone)).toBeNull();
    expect(fake.get).not.toHaveBeenCalled();
  });

  it("keeps only live kits with at least two sections filled", async () => {
    await saveExampleKit(example, { ...live, provenance: { kind: "fixture", generatedAt: "2026-10-08" } });
    await saveExampleKit(example, { ...live, screen: gap, dish: gap, place: gap });
    expect(fake.set).not.toHaveBeenCalled();
  });

  it("builds fresh when nothing is stored or the stored kit no longer fits the contract", async () => {
    expect(await reusedExampleKit(example)).toBeNull();
    store.set(KEY, { music: "not a kit" });
    expect(await reusedExampleKit(example)).toBeNull();
  });

  it("does nothing without Redis", async () => {
    vi.resetModules();
    vi.doMock("@/lib/redis", () => ({ redis: null }));
    const local = await import("@/lib/kit-cache");
    await local.saveExampleKit(example, live);
    expect(await local.reusedExampleKit(example)).toBeNull();
    expect(fake.set).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/redis");
  });
});
