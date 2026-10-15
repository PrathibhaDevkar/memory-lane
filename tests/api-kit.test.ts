import { afterEach, describe, expect, it, vi } from "vitest";

const buildLiveKit = vi.fn();
vi.mock("@/lib/agent/run", () => ({ buildLiveKit: (...args: unknown[]) => buildLiveKit(...args) }));

const { POST } = await import("@/app/api/kit/route");
const { KitSchema, SafetyStopSchema } = await import("@/lib/types");

const post = (body: string) =>
  POST(new Request("http://localhost/api/kit", { method: "POST", body, headers: { "content-type": "application/json" } }));

const walt = {
  suddenChange: false,
  supportLevel: "middle",
  displayName: "Walt",
  birthYear: 1950,
  hometown: "Memphis",
  favorites: [{ text: "Elvis Presley", kind: "artist" }],
  thingsToAvoid: ["war films"],
};

describe("POST /api/kit (fixture mode)", () => {
  it("returns a contract-valid kit labeled as a fixture", async () => {
    const res = await post(JSON.stringify(walt));
    expect(res.status).toBe(200);
    const kit = KitSchema.parse(await res.json());
    expect(kit.provenance.kind).toBe("fixture");
    // The caregiver is told this isn't their kit yet.
    expect(kit.provenance.note).toContain("You asked for Walt (born 1950, Memphis)");
  });

  it("returns 400 with field errors for an invalid profile", async () => {
    const res = await post(JSON.stringify({ ...walt, thingsToAvoid: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toHaveProperty("thingsToAvoid");
  });

  it("gives plain messages for missing fields, not zod defaults", async () => {
    const res = await post(JSON.stringify({}));
    expect(res.status).toBe(400);
    const { issues } = await res.json();
    for (const field of ["suddenChange", "displayName", "supportLevel", "birthYear", "hometown", "favorites", "thingsToAvoid"]) {
      expect(issues[field]?.[0]).toBeTruthy();
      expect(issues[field][0]).not.toMatch(/Invalid input|expected/);
    }
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await post("not json");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/kit: sudden-change safety stop (D9)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    buildLiveKit.mockReset();
  });

  it("returns a safety stop and never runs the agent, even in live mode", async () => {
    vi.stubEnv("KIT_SOURCE", "agent");
    const res = await post(JSON.stringify({ ...walt, suddenChange: true }));
    expect(res.status).toBe(200);
    const stop = SafetyStopSchema.parse(await res.json());
    expect(stop.message).toMatch(/nurse or doctor/);
    expect(buildLiveKit).not.toHaveBeenCalled();
  });

  it("requires an answer to the sudden-change question", async () => {
    const withoutAnswer: Partial<typeof walt> = { ...walt };
    delete withoutAnswer.suddenChange;
    const res = await post(JSON.stringify(withoutAnswer));
    expect(res.status).toBe(400);
    expect((await res.json()).issues.suddenChange[0]).toMatch(/sudden changes/);
  });

  it("requires a support level, with a plain message", async () => {
    const res = await post(JSON.stringify({ ...walt, supportLevel: undefined }));
    expect((await res.json()).issues.supportLevel[0]).toMatch(/how much support/i);
  });
});
