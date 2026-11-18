import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { requireActiveMember } from "@/lib/profiles/context";
import type { Member } from "@/lib/profiles/types";
import { schema } from "./schema";

/**
 * Une base SQLite par profil. L'administrateur (Bastien) garde sa base
 * historique (`DATABASE_URL`, par défaut `data/run-insights.db`), jamais
 * déplacée ; chaque invité a `data/profiles/<id>.db`. Aucune requête ne peut
 * donc lire les données d'un autre profil.
 */
const adminUrl = process.env.DATABASE_URL ?? "file:./data/run-insights.db";
const adminPath = adminUrl.startsWith("file:") ? adminUrl.slice("file:".length) : adminUrl;
const profilesDir = process.env.SILLAGE_PROFILES_DIR ?? "./data/profiles";

export function databasePathFor(member: Pick<Member, "id" | "role">): string {
  return member.role === "admin" ? resolve(adminPath) : resolve(profilesDir, `${member.id}.db`);
}

function open(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  // Les migrations sont appliquées automatiquement : aucune étape manuelle au premier lancement.
  migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  return db;
}

type Handle = ReturnType<typeof open>;
const globalForDatabase = globalThis as typeof globalThis & { sillageDatabases?: Map<string, Handle> };

/** Base d'un profil donné (vue administrateur de la consommation, tests d'isolation). */
export function getDbFor(member: Pick<Member, "id" | "role">): Handle {
  globalForDatabase.sillageDatabases ??= new Map();
  const path = databasePathFor(member);
  let handle = globalForDatabase.sillageDatabases.get(path);
  if (!handle) {
    handle = open(path);
    globalForDatabase.sillageDatabases.set(path, handle);
  }
  return handle;
}

/** Base du profil actif ; erreur s'il n'y en a pas. */
export function getDb(): Handle {
  return getDbFor(requireActiveMember());
}

export type AppDatabase = Handle;

/** Ferme la base d'un profil (avant de la remplacer : réinitialisation du profil de test). */
export function closeDbFor(member: Pick<Member, "id" | "role">): void {
  const path = databasePathFor(member);
  const handle = globalForDatabase.sillageDatabases?.get(path);
  if (!handle) return;
  handle.$client.close();
  globalForDatabase.sillageDatabases?.delete(path);
}
