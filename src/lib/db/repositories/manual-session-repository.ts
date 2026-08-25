import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { manualSessions } from "../schema";
import { localDateSchema, manualSessionInputSchema } from "../contracts";
import type { ManualSession, NewManualSession } from "../types";

function validate(input: NewManualSession): NewManualSession {
  const parsed = manualSessionInputSchema.parse({ sessionDate: input.sessionDate, discipline: input.discipline, durationMinutes: input.durationMinutes, label: input.label ?? undefined, note: input.note ?? undefined });
  return { ...input, label: parsed.label || null, note: parsed.note || null };
}

export function createManualSessionRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewManualSession): Promise<ManualSession> { const [row] = await database.insert(manualSessions).values(validate(input)).returning(); return row; },
    async findById(id: string): Promise<ManualSession | undefined> { return database.query.manualSessions.findFirst({ where: eq(manualSessions.id, id) }); },
    async findByPeriod(from: string, to: string): Promise<ManualSession[]> { localDateSchema.parse(from); localDateSchema.parse(to); return database.select().from(manualSessions).where(and(gte(manualSessions.sessionDate, from), lte(manualSessions.sessionDate, to))).orderBy(desc(manualSessions.sessionDate), desc(manualSessions.id)); },
    async update(id: string, changes: Partial<NewManualSession>): Promise<ManualSession | undefined> { const existing = await database.query.manualSessions.findFirst({ where: eq(manualSessions.id, id) }); if (!existing) return undefined; const merged = validate({ ...existing, ...changes, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }); const [row] = await database.update(manualSessions).set({ sessionDate: merged.sessionDate, discipline: merged.discipline, durationMinutes: merged.durationMinutes, label: merged.label, note: merged.note, updatedAt: merged.updatedAt }).where(eq(manualSessions.id, id)).returning(); return row; },
    async remove(id: string): Promise<void> { await database.delete(manualSessions).where(eq(manualSessions.id, id)); },
  };
}