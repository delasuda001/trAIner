import { asc, desc, gte } from "drizzle-orm";
import type { WellnessDay } from "@/lib/source/types";
import { getDb, type AppDatabase } from "../client";
import { wellnessDays } from "../schema";
import type { WellnessRow } from "../types";

export function createWellnessRepository(database: AppDatabase = getDb()) {
  return {
    upsert(days: WellnessDay[], now = new Date().toISOString()): void {
      database.transaction((tx) => {
        for (const day of days) {
          const values = { ...day, updatedAt: now };
          tx.insert(wellnessDays).values(values).onConflictDoUpdate({ target: wellnessDays.date, set: values }).run();
        }
      });
    },
    latestDate(): string | null {
      return database.select({ date: wellnessDays.date }).from(wellnessDays).orderBy(desc(wellnessDays.date)).limit(1).get()?.date ?? null;
    },
    findSince(date: string): WellnessRow[] {
      return database.select().from(wellnessDays).where(gte(wellnessDays.date, date)).orderBy(asc(wellnessDays.date)).all();
    },
  };
}
