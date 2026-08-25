import { and, eq, ne } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { goalDefinitionSchema, goalPrioritySchema, goalStatusSchema, parseJson, serializeJson } from "../contracts";
import { goals } from "../schema";
import type { Goal, NewGoal } from "../types";

export function createGoalRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewGoal): Promise<Goal> { goalPrioritySchema.parse(input.priority); goalStatusSchema.parse(input.status); const definition = parseJson(goalDefinitionSchema, input.definitionJson); const values = { ...input, definitionJson: serializeJson(goalDefinitionSchema, definition) }; return database.transaction((transaction) => { if (input.priority === "primary" && input.status === "active" && transaction.select().from(goals).where(and(eq(goals.priority, "primary"), eq(goals.status, "active"))).all().length > 0) throw new Error("Un seul objectif principal actif est autorisé"); const [row] = transaction.insert(goals).values(values).returning().all(); return row; }); },
    async findById(id: string): Promise<Goal | undefined> { return database.query.goals.findFirst({ where: eq(goals.id, id) }); },
    async update(id: string, changes: Partial<NewGoal>): Promise<Goal | undefined> { if (changes.priority) goalPrioritySchema.parse(changes.priority); if (changes.status) goalStatusSchema.parse(changes.status); if (changes.definitionJson) { const definition = parseJson(goalDefinitionSchema, changes.definitionJson); changes.definitionJson = serializeJson(goalDefinitionSchema, definition); } return database.transaction((transaction) => { if (changes.priority === "primary" && changes.status === "active" && transaction.select().from(goals).where(and(eq(goals.priority, "primary"), eq(goals.status, "active"), ne(goals.id, id))).all().length > 0) throw new Error("Un seul objectif principal actif est autorisé"); const [row] = transaction.update(goals).set(changes).where(eq(goals.id, id)).returning().all(); return row; }); },
  };
}