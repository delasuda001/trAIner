import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import * as dbClient from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { GET, POST } from "./route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;

const ACTIVITY_ID = "i179394628";
const validBody = { sessionGoal: "Tempo 4x2km", perceivedExertion: "difficile", unusualFatigue: false, painFlag: false, note: "Vent de face sur la 3e" };

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(id: string, body: unknown) {
  return POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), params(id));
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  database = drizzle(sqlite, { schema });
  vi.spyOn(dbClient, "getDb").mockReturnValue(database);
});

afterEach(() => {
  vi.restoreAllMocks();
  sqlite.close();
});

describe("POST /api/activities/[id]/context", () => {
  it("enregistre un contexte valide et le relit via GET", async () => {
    const response = await post(ACTIVITY_ID, validBody);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      intervalsActivityId: ACTIVITY_ID,
      sessionGoal: "Tempo 4x2km",
      perceivedExertion: "difficile",
      unusualFatigue: 0,
      painFlag: 0,
      note: "Vent de face sur la 3e",
    });

    const read = await GET(new Request("http://localhost"), params(ACTIVITY_ID));
    await expect(read.json()).resolves.toMatchObject({ intervalsActivityId: ACTIVITY_ID, sessionGoal: "Tempo 4x2km" });
  });

  it("convertit les drapeaux booléens en entiers 0/1", async () => {
    const response = await post(ACTIVITY_ID, { ...validBody, unusualFatigue: true, painFlag: true });
    await expect(response.json()).resolves.toMatchObject({ unusualFatigue: 1, painFlag: 1 });
  });

  it("remplace le contexte existant sans créer de doublon (upsert) et préserve id + createdAt", async () => {
    const first = (await (await post(ACTIVITY_ID, validBody)).json()) as { id: string; createdAt: string };
    const second = await post(ACTIVITY_ID, { ...validBody, sessionGoal: "Sortie longue", painFlag: true, note: "Douleur genou km 12" });
    expect(second.status).toBe(200);
    const secondPayload = (await second.json()) as { id: string; createdAt: string };

    expect(sqlite.prepare("select count(*) as count from activity_contexts where intervals_activity_id = ?").get(ACTIVITY_ID)).toMatchObject({ count: 1 });
    expect(secondPayload.id).toBe(first.id);
    expect(secondPayload.createdAt).toBe(first.createdAt);
    const read = await GET(new Request("http://localhost"), params(ACTIVITY_ID));
    await expect(read.json()).resolves.toMatchObject({ id: first.id, createdAt: first.createdAt, sessionGoal: "Sortie longue", painFlag: 1, note: "Douleur genou km 12" });
  });

  it("rejette un identifiant d'activité invalide", async () => {
    const response = await post("bad/id", validBody);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_ACTIVITY_ID" } });
  });

  it.each([
    ["perceivedExertion trop long", { perceivedExertion: "x".repeat(101) }],
    ["note trop longue", { note: "n".repeat(2001) }],
    ["unusualFatigue non booléen", { unusualFatigue: "oui" }],
    ["painFlag non booléen", { painFlag: 1 }],
    ["champ requis manquant", { sessionGoal: undefined }],
  ])("rejette un corps invalide : %s", async (_label, override) => {
    const response = await post(ACTIVITY_ID, { ...validBody, ...override });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(sqlite.prepare("select count(*) as count from activity_contexts").get()).toMatchObject({ count: 0 });
  });
});

describe("GET /api/activities/[id]/context", () => {
  it("retourne null quand aucun contexte n'existe", async () => {
    const response = await GET(new Request("http://localhost"), params(ACTIVITY_ID));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
  });
});
