import { and, eq, ne } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { athleteContextSchema, contextStatusSchema, parseJson, serializeJson } from "../contracts";
import { athleteContextVersions } from "../schema";
import type { AthleteContextVersion, NewAthleteContextVersion } from "../types";

export function createAthleteContextRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewAthleteContextVersion): Promise<AthleteContextVersion> { contextStatusSchema.parse(input.status); const context = parseJson(athleteContextSchema, input.contextJson); const [row] = await database.insert(athleteContextVersions).values({ ...input, contextJson: serializeJson(athleteContextSchema, context) }).returning(); return row; },
    async findById(id: string): Promise<AthleteContextVersion | undefined> { return database.query.athleteContextVersions.findFirst({ where: eq(athleteContextVersions.id, id) }); },
    async findActive(): Promise<AthleteContextVersion | undefined> { return database.query.athleteContextVersions.findFirst({ where: eq(athleteContextVersions.status, "active") }); },
    async createAndActivate(input: NewAthleteContextVersion): Promise<AthleteContextVersion> { contextStatusSchema.parse(input.status); const context = parseJson(athleteContextSchema, input.contextJson); return database.transaction((transaction) => { const now = new Date().toISOString(); transaction.update(athleteContextVersions).set({ status: "archived", archivedAt: now, updatedAt: now }).where(eq(athleteContextVersions.status, "active")).run(); const [row] = transaction.insert(athleteContextVersions).values({ ...input, status: "active", contextJson: serializeJson(athleteContextSchema, context), activatedAt: now, createdAt: now, updatedAt: now }).returning().all(); return row; }); },
    async activate(id: string): Promise<AthleteContextVersion | undefined> { const now = new Date().toISOString(); return database.transaction((transaction) => { transaction.update(athleteContextVersions).set({ status: "archived", archivedAt: now, updatedAt: now }).where(and(eq(athleteContextVersions.status, "active"), ne(athleteContextVersions.id, id))).run(); const [row] = transaction.update(athleteContextVersions).set({ status: "active", activatedAt: now, updatedAt: now }).where(eq(athleteContextVersions.id, id)).returning().all(); return row; }); },
  };
}