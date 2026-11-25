import "server-only";

import { readFileSync } from "node:fs";
import { z } from "zod";
import type { SillageEnv } from "./environment";

/**
 * Version en place dans chaque environnement, écrite par `scripts/sillage-env.sh` au déploiement :
 * commit, branche, heure du build ; pour le test, heure de la dernière copie des données de prod.
 */

const releaseSchema = z.object({ commit: z.string(), branch: z.string(), subject: z.string().optional(), builtAt: z.string() });
const copySchema = z.object({ copiedAt: z.string() });

export type Release = z.infer<typeof releaseSchema>;

const FILES: Record<SillageEnv, string> = { prod: "data/prod-release.json", test: "data/test/release.json" };

function readJson<T>(path: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readRelease(env: SillageEnv): Release | null {
  return readJson(FILES[env], releaseSchema);
}

/** Heure de la dernière copie des données de prod vers le test. */
export function testDataCopiedAt(): string | null {
  return readJson("data/test/copied-at.json", copySchema)?.copiedAt ?? null;
}
