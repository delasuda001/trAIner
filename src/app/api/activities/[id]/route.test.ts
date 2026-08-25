import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "./route";

const activity = { id: "activity-123", name: "Sortie facile", type: "Run", distance: 5000, moving_time: 1500, average_speed: 3.33 };
const interval = { id: 1, label: "Lap 1", distance: 1000, moving_time: 300, average_speed: 3.33 };

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

afterEach(() => vi.unstubAllGlobals());
beforeAll(() => {
  process.env.INTERVALS_API_KEY = "test-key";
  process.env.INTERVALS_ATHLETE_ID = "test-athlete";
});

describe("GET /api/activities/[id]", () => {
  it("retourne les métadonnées et les laps", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(activity), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "activity-123", icu_intervals: [interval] }), { status: 200 })));

    const response = await GET(new Request("http://localhost"), params("activity-123"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ activity, laps: [{ id: 1, name: "Lap 1", distance: 1000, moving_time: 300, average_speed: 3.33 }] });
  });

  it("retourne 404 quand l’activité est absente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));

    const response = await GET(new Request("http://localhost"), params("missing"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INTERVALS_NOT_FOUND" } });
  });

  it("retourne 502 quand la réponse activité est invalide", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "Sans identifiant" }), { status: 200 })));

    const response = await GET(new Request("http://localhost"), params("activity-123"));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INTERVALS_VALIDATION_ERROR" } });
  });

  it("retourne 502 en cas d’erreur réseau externe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));

    const response = await GET(new Request("http://localhost"), params("activity-123"));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INTERVALS_API_ERROR" } });
  });
});