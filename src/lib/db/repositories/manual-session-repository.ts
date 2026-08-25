import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { manualSessions } from "../schema";
import { localDateSchema, manualDisciplineSchema } from "../contracts";
import type { ManualSession, NewManualSession } from "../types";

function validate(input: NewManualSession): NewManualSession {
  localDateSchema.parse(input.sessionDate);
  manualDisciplineSchema.parse(input.discipline);
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) throw new Error("La durée doit être un entier strictement positif");
  return input;
}

export function createManualSessionRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewManualSession): Promise<ManualSession> { const [row] = await database.insert(manualSessions).values(validate(input)).returning(); return row; },
    async findById(id: string): Promise<ManualSession | undefined> { return database.query.manualSessions.findFirst({ where: eq(manualSessions.id, id) }); },
    async findByPeriod(from: string, to: string): Promise<ManualSession[]> { localDateSchema.parse(from); localDateSchema.parse(to); return database.select().from(manualSessions).where(and(gte(manualSessions.sessionDate, from), lte(manualSessions.sessionDate, to))).orderBy(manualSessions.sessionDate); },
    async update(id: string, changes: Partial<NewManualSession>): Promise<ManualSession | undefined> { if (changes.sessionDate) localDateSchema.parse(changes.sessionDate); if (changes.discipline) manualDisciplineSchema.parse(changes.discipline); if (changes.durationMinutes !== undefined && (!Number.isInteger(changes.durationMinutes) || changes.durationMinutes <= 0)) throw new Error("La durée doit être un entier strictement positif"); const [row] = await database.update(manualSessions).set(changes).where(eq(manualSessions.id, id)).returning(); return row; },
    async remove(id: string): Promise<void> { await database.delete(manualSessions).where(eq(manualSessions.id, id)); },
  };
}