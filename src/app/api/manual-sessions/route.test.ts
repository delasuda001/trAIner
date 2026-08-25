import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { createManualSession, getManualSessions } from "./route";
import { deleteManualSession, updateManualSession } from "./[id]/route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const base = { sessionDate: "2026-08-25", discipline: "strength_training", durationMinutes: 45, label: "Renforcement", note: "Séance courte" };

function applyMigration(connection: Database.Database): void {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_previous_marrow.sql"), "utf8");
  connection.exec(migration.replaceAll("--> statement-breakpoint", ""));
}

async function create(): Promise<{ id: string; createdAt: string }> {
  const response = await createManualSession(new Request("http://localhost", { method: "POST", body: JSON.stringify(base) }), database);
  return response.json();
}

beforeEach(() => { sqlite = new Database(":memory:"); applyMigration(sqlite); database = drizzle(sqlite, { schema }); });
afterEach(() => sqlite.close());

describe("/api/manual-sessions", () => {
  it("retourne [] sans séance et crée une séance valide", async () => {
    await expect((await getManualSessions(new Request("http://localhost"), database)).json()).resolves.toEqual([]);
    const response = await createManualSession(new Request("http://localhost", { method: "POST", body: JSON.stringify(base) }), database);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject(base);
  });

  it.each([
    ["date", { ...base, sessionDate: "25-08-2026" }],
    ["discipline", { ...base, discipline: "Run" }],
    ["durée zéro", { ...base, durationMinutes: 0 }],
    ["durée négative", { ...base, durationMinutes: -1 }],
    ["durée excessive", { ...base, durationMinutes: 721 }],
    ["libellé", { ...base, label: "x".repeat(101) }],
    ["note", { ...base, note: "x".repeat(501) }],
  ])("refuse une saisie invalide (%s)", async (_label, payload) => {
    const response = await createManualSession(new Request("http://localhost", { method: "POST", body: JSON.stringify(payload) }), database);
    expect(response.status).toBe(400);
  });

  it("filtre par date et trie de la plus récente à la plus ancienne", async () => {
    await createManualSession(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...base, sessionDate: "2026-08-20" }) }), database);
    await createManualSession(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...base, sessionDate: "2026-08-25" }) }), database);
    const response = await getManualSessions(new Request("http://localhost?from=2026-08-21&to=2026-08-25"), database);
    await expect(response.json()).resolves.toHaveLength(1);
    expect(response.status).toBe(200);
  });

  it("modifie uniquement les champs fournis et préserve created_at", async () => {
    const session = await create();
    const response = await updateManualSession(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ label: "Nouveau nom" }) }), session.id, database);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: session.id, label: "Nouveau nom", sessionDate: base.sessionDate, createdAt: session.createdAt });
    await expect(updateManualSession(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ label: "x" }) }), "missing", database)).resolves.toHaveProperty("status", 404);
  });

  it("supprime uniquement la séance manuelle et renvoie 404 si absente", async () => {
    const session = await create();
    await expect(deleteManualSession(session.id, database)).resolves.toHaveProperty("status", 204);
    await expect(deleteManualSession(session.id, database)).resolves.toHaveProperty("status", 404);
  });
});