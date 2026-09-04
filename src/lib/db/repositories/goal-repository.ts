import { and, eq, ne } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { goalDefinitionSchema, goalPrioritySchema, goalStatusSchema, parseJson, serializeJson } from "../contracts";
import { goals } from "../schema";
import type { Goal, NewGoal } from "../types";

export function createGoalRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewGoal): Promise<Goal> { goalPrioritySchema.parse(input.priority); goalStatusSchema.parse(input.status); const definition = parseJson(goalDefinitionSchema, input.definitionJson); const values = { ...input, definitionJson: serializeJson(goalDefinitionSchema, definition) }; return database.transaction((transaction) => { if (input.priority === "primary" && input.status === "active") transaction.update(goals).set({ priority: "secondary", status: "paused", updatedAt: new Date().toISOString() }).where(and(eq(goals.priority, "primary"), eq(goals.status, "active"))).run(); const [row] = transaction.insert(goals).values(values).returning().all(); return row; }); },
    async findById(id: string): Promise<Goal | undefined> { return database.query.goals.findFirst({ where: eq(goals.id, id) }); },
    async findByStatus(status: string): Promise<Goal[]> { return database.query.goals.findMany({ where: eq(goals.status, status as Goal["status"]) }); },
    async findAll(includeArchived = false): Promise<Goal[]> { const rows = await database.select().from(goals).orderBy(goals.status, goals.priority, goals.targetDate); return includeArchived ? rows : rows.filter((goal) => goal.status !== "archived"); },
    async update(id: string, changes: Partial<NewGoal>): Promise<Goal | undefined> { if (changes.priority) goalPrioritySchema.parse(changes.priority); if (changes.status) goalStatusSchema.parse(changes.status); if (changes.definitionJson) { const definition = parseJson(goalDefinitionSchema, changes.definitionJson); changes.definitionJson = serializeJson(goalDefinitionSchema, definition); } return database.transaction((transaction) => { const current = transaction.select().from(goals).where(eq(goals.id, id)).get(); if (!current) return undefined; const nextPriority = changes.priority ?? current.priority; const nextStatus = changes.status ?? current.status; if (nextPriority === "primary" && nextStatus === "active") { transaction.update(goals).set({ priority: "secondary", status: "paused", updatedAt: new Date().toISOString() }).where(and(eq(goals.priority, "primary"), eq(goals.status, "active"), ne(goals.id, id))).run(); } const [row] = transaction.update(goals).set(changes).where(eq(goals.id, id)).returning().all(); return row; }); },
    async archive(id: string): Promise<Goal | undefined> { const [row] = await database.update(goals).set({ status: "archived", updatedAt: new Date().toISOString() }).where(eq(goals.id, id)).returning(); return row; },
  };
}