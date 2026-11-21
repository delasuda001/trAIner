import { z } from "zod";
import type { LlmRateLimit } from "./llm";

/**
 * Relevé de l'abonnement Claude (fenêtres 5 h et 7 jours). Deux sources :
 * - l'événement `rate_limit_event` que le SDK émet à chaque appel du coach : une seule
 *   fenêtre, et le pourcentage n'y figure qu'en cas d'alerte ;
 * - le relevé `/usage` du CLI (`usage_EXPERIMENTAL…`), qui interroge le compte claude.ai
 *   sans appeler de modèle (aucun token) et donne toutes les fenêtres, en pourcentage.
 * Fonctions pures, testées. Toute utilisation est stockée en fraction 0–1.
 */

const windowSchema = z.object({ utilization: z.number().nullable().optional(), resets_at: z.string().nullable().optional() }).nullable().optional();

/** Réponse du relevé `/usage` (seuls les champs lus ; le reste est ignoré). Donnée externe : validée. */
export const planUsageSchema = z.object({
  rate_limits_available: z.boolean(),
  rate_limits: z
    .object({ five_hour: windowSchema, seven_day: windowSchema, seven_day_opus: windowSchema, seven_day_sonnet: windowSchema })
    .nullable(),
});

/** Fenêtres lues dans le relevé `/usage` ; null s'il n'est pas exploitable. */
export function windowsFromPlanUsage(raw: unknown): LlmRateLimit[] | null {
  const parsed = planUsageSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.rate_limits_available || !parsed.data.rate_limits) return null;
  const windows: LlmRateLimit[] = [];
  for (const [name, value] of Object.entries(parsed.data.rate_limits)) {
    if (!value || value.utilization == null) continue;
    // Le relevé donne un pourcentage 0–100.
    const utilization = Math.max(0, value.utilization) / 100;
    const resetsAt = value.resets_at && !Number.isNaN(Date.parse(value.resets_at)) ? new Date(value.resets_at).toISOString() : null;
    windows.push({ status: utilization >= 1 ? "rejected" : "allowed", window: name, utilization, resetsAt });
  }
  return windows.length ? windows : null;
}

export type StoredRateWindow = LlmRateLimit & { seenAt: string };

function sameReset(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(Date.parse(a) - Date.parse(b)) < 5 * 60_000;
}

/**
 * Fusionne de nouveaux relevés dans l'état stocké. Un événement d'appel sans pourcentage
 * (cas normal hors alerte) ne doit pas effacer le pourcentage connu de la même fenêtre :
 * on le garde tant que la remise à zéro est la même.
 */
export function mergeRateWindows(stored: Record<string, StoredRateWindow>, incoming: LlmRateLimit[], seenAt: string): Record<string, StoredRateWindow> {
  const next = { ...stored };
  for (const window of incoming) {
    const key = window.window ?? "inconnue";
    const previous = next[key];
    const keepPrevious = window.utilization == null && previous?.utilization != null && sameReset(previous.resetsAt, window.resetsAt);
    next[key] = { ...window, utilization: keepPrevious ? previous.utilization : window.utilization, seenAt };
  }
  return next;
}
