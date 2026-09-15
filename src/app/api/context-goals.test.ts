import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { getContext, putContext } from "./context/route";
import { createGoal, getGoals } from "./goals/route";
import { updateGoal } from "./goals/[id]/route";
import { archiveGoal } from "./goals/[id]/archive/route";

vi.mock("server-only", () => ({}));
let sqlite: Database.Database;
let database: AppDatabase;
const context = { version: 1 as const, athleteProfile: { experienceLevel: "confirmed" as const, notes: "Course régulière" }, performanceReferences: [{ id: "ref-1", label: "Seuil", value: "4:15 min/km", source: "Déclaré", observedDate: "2026-08-25" }], priorities: { primary: "Régularité", secondary: ["Vitesse"] }, weeklyTemplate: { monday: { activities: ["running" as const], flexible: false } }, currentBlock: { title: "Base", durationWeeks: 8, priority: "Endurance", description: "Bloc actuel", personalRules: ["Rester progressif"] }, coachingPreferences: { wantsCriticalDataGroundedFeedback: true, wantsTrainingScenariosToReview: true, wantsSourcesAndLimitationsAlwaysVisible: true } };
const goal = { title: "10 km", type: "race", priority: "primary", status: "active", targetDate: "2026-10-01", definition: {} };
beforeEach(() => { sqlite = new Database(":memory:"); applyMigrations(sqlite); database = drizzle(sqlite, { schema }); });
afterEach(() => sqlite.close());

describe("context et objectifs", () => {
  it("retourne null, puis versionne deux contextes actifs", async () => {
    await expect((await getContext(database)).json()).resolves.toBeNull();
    const first = await putContext(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ context }) }), database);
    const firstPayload = await first.json();
    const second = await putContext(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ context: { ...context, athleteProfile: { ...context.athleteProfile, notes: "Deuxième version" } } }) }), database);
    expect(second.status).toBe(200);
    expect(sqlite.prepare("select count(*) as count from athlete_context_versions").get()).toMatchObject({ count: 2 });
    expect(sqlite.prepare("select count(*) as count from athlete_context_versions where status = 'active'").get()).toMatchObject({ count: 1 });
    expect(firstPayload.id).not.toBe((await second.json()).id);
  });

  it("refuse un contexte invalide et une date de repère invalide", async () => {
    const invalid = { ...context, performanceReferences: [{ id: "x", label: "x", value: "x", observedDate: "25-08-2026" }] };
    await expect(putContext(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ context: invalid }) }), database)).resolves.toHaveProperty("status", 400);
  });

  it("crée, trie, modifie et archive les objectifs sans suppression", async () => {
    const primary = await createGoal(new Request("http://localhost", { method: "POST", body: JSON.stringify(goal) }), database);
    expect(primary.status).toBe(201);
    const primaryPayload = await primary.json();
    const secondary = await createGoal(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...goal, title: "Processus", priority: "secondary", targetDate: "2026-09-01" }) }), database);
    expect(secondary.status).toBe(201);
    const changed = await updateGoal(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "10 km objectif" }) }), primaryPayload.id, database);
    expect(await changed.json()).toMatchObject({ title: "10 km objectif", type: "race" });
    const secondPrimary = await createGoal(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...goal, title: "Nouveau principal" }) }), database);
    expect(secondPrimary.status).toBe(201);
    expect(sqlite.prepare("select count(*) as count from goals where priority = 'primary' and status = 'active'").get()).toMatchObject({ count: 1 });
    const listed = await getGoals(new Request("http://localhost/api/goals"), database);
    expect(listed.status).toBe(200);
    expect((await listed.json()).every((item: { status: string }) => item.status !== "archived")).toBe(true);
    await expect(archiveGoal(primaryPayload.id, database)).resolves.toHaveProperty("status", 200);
    expect(sqlite.prepare("select count(*) as count from goals").get()).toMatchObject({ count: 3 });
  });
});