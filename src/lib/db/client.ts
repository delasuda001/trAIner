import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/run-insights.db";
const databasePath = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;

const globalForDatabase = globalThis as typeof globalThis & { runInsightsDatabase?: Database.Database };

export function getDb() {
	const sqlite = globalForDatabase.runInsightsDatabase ?? new Database(databasePath);
	sqlite.pragma("journal_mode = WAL");
	if (process.env.NODE_ENV !== "production") globalForDatabase.runInsightsDatabase = sqlite;
	return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof getDb>;