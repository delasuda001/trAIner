import { z } from "zod";

/**
 * Sorties courues sans montre, déclarées par le coureur (date et durée). Elles comptent dans la
 * régularité (série, calendrier) mais jamais dans les allures, la charge ni les analyses : aucune
 * donnée mesurée n'y est attachée. Stockées dans l'état de l'application du profil.
 */
export const DECLARED_RUNS_KEY = "declared_runs";
export const MAX_DECLARED_RUNS = 200;

export const declaredRunSchema = z.object({
  id: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMin: z.number().int().min(5).max(600),
});
export type DeclaredRun = z.infer<typeof declaredRunSchema>;
export const declaredRunsSchema = z.array(declaredRunSchema).max(MAX_DECLARED_RUNS);

export const declaredRunInputSchema = declaredRunSchema.omit({ id: true });

/** Ajout trié par date ; une date future est refusée ; on garde les plus récentes au-delà du plafond. */
export function addDeclaredRun(list: DeclaredRun[], input: z.infer<typeof declaredRunInputSchema>, id: string, today: string): DeclaredRun[] {
  if (input.date > today) throw new Error("Une sortie déclarée ne peut pas être dans le futur.");
  return [...list, { id, ...input }].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_DECLARED_RUNS);
}

export function removeDeclaredRun(list: DeclaredRun[], id: string): DeclaredRun[] {
  return list.filter((run) => run.id !== id);
}
