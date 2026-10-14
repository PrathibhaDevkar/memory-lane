import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/kit/route";
import { KitSchema } from "@/lib/types";

const post = (body: string) =>
  POST(new Request("http://localhost/api/kit", { method: "POST", body, headers: { "content-type": "application/json" } }));

const walt = {
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

  it("returns 400 for a non-JSON body", async () => {
    const res = await post("not json");
    expect(res.status).toBe(400);
  });
});
