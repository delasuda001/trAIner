import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle");

/**
 * Applique, dans l'ordre, toutes les migrations SQL générées par drizzle-kit
 * (`drizzle/*.sql`) sur une connexion `better-sqlite3` en mémoire.
 *
 * Toute suite de tests qui monte une base SQLite DOIT passer par cette
 * fonction, jamais réécrire un `CREATE TABLE` à la main ni énumérer les
 * fichiers de migration un par un : ajouter une migration ne doit alors
 * plus jamais obliger à toucher les fichiers de test (cf. l'omission
 * silencieuse de `0001` corrigée lors d'un audit précédent).
 */
export function applyMigrations(connection: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    connection.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
}
