import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { schema } from "./schema";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/run-insights.db";
const databasePath = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;

const globalForDatabase = globalThis as typeof globalThis & { runInsightsDatabase?: ReturnType<typeof open> };

function open() {
  mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  // Les migrations sont appliquées automatiquement : aucune étape manuelle au premier lancement.
  migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  return db;
}

export function getDb() {
  globalForDatabase.runInsightsDatabase ??= open();
  return globalForDatabase.runInsightsDatabase;
}

export type AppDatabase = ReturnType<typeof getDb>;
