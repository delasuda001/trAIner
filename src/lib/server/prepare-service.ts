import "server-only";

import { z } from "zod";
import { TASK_ESTIMATE } from "@/lib/bench/budget";
import { getRegistry, runAs, toMember } from "@/lib/profiles/context";
import type { Member } from "@/lib/profiles/types";
import { analyzeSession, getDashboard, loadContext } from "./analytics";
import { prepareOutlookCoach, prepareSessionCoach } from "./coach-service";
import { checkQuota, coachGauge } from "./quota";
import { syncNow } from "./sync-service";
import { refreshRateLimits } from "./usage";

/**
 * Préparation d'un invité par Bastien, avant que l'invité n'ouvre son lien :
 * import Garmin complet, calcul de toutes les métriques du moteur (aucun token),
 * puis analyses du coach des 2 dernières séances et conseil du jour. Rien de plus :
 * le reste est à la demande, et les nouvelles séances dans la limite du plafond.
 */

/** Séances analysées d'avance : l'effet « tout est déjà là » sans analyse en masse. */
export const PREPARED_SESSIONS = 2;
/** Coût estimé : 2 analyses de séance + le conseil du jour. */
export const PREPARATION_ESTIMATE = (PREPARED_SESSIONS + 1) * TASK_ESTIMATE.generation;
/** Tours de synchro au plus (40 séries détaillées par tour). */
const MAX_SYNC_ROUNDS = 30;

const stageSchema = z.enum(["sync", "metrics", "coach", "ready", "error"]);
export type PrepareStage = z.infer<typeof stageSchema>;

const statusSchema = z.object({
  stage: stageSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
  activities: z.number().int().nonnegative().default(0),
  runs: z.number().int().nonnegative().default(0),
  pendingDetails: z.number().int().nonnegative().default(0),
  analyses: z.number().int().nonnegative().default(0),
  /** Ce qui n'a pas pu être fait (erreur Garmin, coach en pause) : dit simplement. */
  note: z.string().nullable().default(null),
});
export type PrepareStatus = z.infer<typeof statusSchema> & { running: boolean };

const globalForPrepare = globalThis as typeof globalThis & { sillagePreparing?: Set<string> };
function running(): Set<string> {
  globalForPrepare.sillagePreparing ??= new Set();
  return globalForPrepare.sillagePreparing;
}

const keyOf = (id: string) => `prepare_${id}`;

export function readPrepareStatus(id: string): PrepareStatus | null {
  const stored = getRegistry().getSetting(keyOf(id), statusSchema);
  if (!stored) return null;
  const isRunning = running().has(id);
  // Application relancée pendant une préparation : on le dit, Bastien peut relancer.
  if (!isRunning && stored.stage !== "ready" && stored.stage !== "error") return { ...stored, stage: "error", note: "Préparation interrompue (application relancée) : relance-la.", running: false };
  return { ...stored, running: isRunning };
}

function save(id: string, patch: Partial<z.infer<typeof statusSchema>>): void {
  const previous = getRegistry().getSetting(keyOf(id), statusSchema);
  const now = new Date().toISOString();
  const base = previous ?? { stage: "sync" as const, startedAt: now, updatedAt: now, activities: 0, runs: 0, pendingDetails: 0, analyses: 0, note: null };
  getRegistry().setSetting(keyOf(id), { ...base, ...patch, updatedAt: now });
}

/** Ce que dirait la garde avant de lancer la préparation (plafond commun, abonnement). */
export function preparationAllowed(member: Member): { allowed: boolean; message: string | null } {
  return runAs(member, () => {
    const decision = checkQuota(PREPARATION_ESTIMATE, { preparation: true });
    if (decision.allowed) return { allowed: true, message: null };
    // Message pour Bastien (et non pour l'invité) : ce qui bloque, et quand ça se libère.
    const gauge = coachGauge();
    if (gauge.level === "plein") {
      const reset = gauge.resetsAt ? ` après la remise à zéro (${new Date(gauge.resetsAt).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })})` : " plus tard";
      return { allowed: false, message: `Ton abonnement dépasse le seuil d'arrêt des invités (60 % sur 5 h ou 70 % sur 7 jours) : réessaie${reset}.` };
    }
    return { allowed: false, message: "Plafond commun des invités atteint cette semaine : la préparation attendra." };
  });
}

/** Lance la préparation en arrière-plan ; false si elle tourne déjà. */
export function startPreparation(id: string): boolean {
  const record = getRegistry().find(id);
  if (!record || record.role !== "guest" || running().has(id)) return false;
  const member = toMember(record);
  running().add(id);
  const startedAt = new Date().toISOString();
  getRegistry().setSetting(keyOf(id), { stage: "sync", startedAt, updatedAt: startedAt, activities: 0, runs: 0, pendingDetails: 0, analyses: 0, note: null });
  void runAs(member, () => prepareProfile(member))
    .catch((error: unknown) => save(id, { stage: "error", note: `Échec : ${error instanceof Error ? error.message.slice(0, 200) : String(error)}` }))
    .finally(() => running().delete(id));
  return true;
}

/** Préparation complète du profil actif. `sync` est remplaçable pour les essais hors ligne. */
export async function prepareProfile(member: Member, sync: (member: Member) => ReturnType<typeof syncNow> = syncNow): Promise<void> {
  // 1. Import Garmin complet (12 mois de résumés, séries des 12 dernières semaines).
  let pending = 0;
  let total = 0;
  for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
    const result = await sync(member);
    pending = result.pendingDetails;
    total = result.totalActivities;
    save(member.id, { stage: "sync", activities: total, pendingDetails: pending });
    if (pending === 0) break;
  }

  // 2. Métriques du moteur pour tout l'historique (mises en cache en base), aucun token.
  save(member.id, { stage: "metrics" });
  const context = loadContext();
  getDashboard();
  save(member.id, { stage: "coach", runs: context.runs.length });

  // 3. Coach : les 2 dernières séances et le conseil du jour, si la garde le permet.
  await refreshRateLimits({ maxAgeMs: 2 * 60_000, waitMs: 4_000 });
  const allowed = checkQuota(PREPARATION_ESTIMATE, { preparation: true });
  if (!allowed.allowed) {
    const why = coachGauge().level === "plein" ? "abonnement chargé" : "plafond commun des invités atteint cette semaine";
    save(member.id, { stage: "ready", note: `Analyses du coach non préparées (${why}) : elles se feront à la demande.` });
    return;
  }
  let analyses = 0;
  const failures: string[] = [];
  for (const run of context.runs.slice(-PREPARED_SESSIONS)) {
    const analysis = analyzeSession(run.id, context);
    if (!analysis) continue;
    const result = await prepareSessionCoach(analysis);
    if (result.status === "ready") analyses += 1;
    else if (result.status === "error") failures.push(result.message);
    save(member.id, { analyses });
  }
  if (context.runs.length) {
    const outlook = await prepareOutlookCoach(getDashboard());
    if (outlook.status === "ready") analyses += 1;
    else if (outlook.status === "error") failures.push(outlook.message);
  }
  save(member.id, { stage: "ready", analyses, note: failures.length ? `Certaines analyses n'ont pas pu être faites (${failures[0]}) : elles se feront à la demande.` : null });
}
