import { eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb, type AppDatabase } from "../client";
import { appState } from "../schema";

export function createAppStateRepository(database: AppDatabase = getDb()) {
  return {
    get<T>(key: string, schema: z.ZodType<T>): T | null {
      const row = database.select().from(appState).where(eq(appState.key, key)).get();
      if (!row) return null;
      const parsed = schema.safeParse(JSON.parse(row.valueJson));
      return parsed.success ? parsed.data : null;
    },
    set(key: string, value: unknown, now = new Date().toISOString()): void {
      const valueJson = JSON.stringify(value);
      database.insert(appState).values({ key, valueJson, updatedAt: now }).onConflictDoUpdate({ target: appState.key, set: { valueJson, updatedAt: now } }).run();
    },
  };
}
