/**
 * Plafonds du travail automatique (banc + bilan) : par nuit, par semaine, et
 * état du quota de l'abonnement remonté par Claude. Fonctions pures.
 */

export type BudgetConfig = {
  nightTokens: number;
  weekTokens: number;
  /** Utilisation (0–1) au-delà de laquelle on s'arrête, par fenêtre de quota. */
  maxUtilization: { fiveHour: number; sevenDay: number };
};

export const DEFAULT_BUDGET: BudgetConfig = { nightTokens: 40_000, weekTokens: 100_000, maxUtilization: { fiveHour: 0.6, sevenDay: 0.7 } };

/** Tokens qui comptent dans les plafonds : entrée, sortie et écriture du cache (la relecture du cache, bien moins chère, est exclue). */
export function budgetTokens(record: { inputTokens: number; outputTokens: number; cacheCreationTokens: number }): number {
  return record.inputTokens + record.outputTokens + record.cacheCreationTokens;
}

/** Estimations prudentes par tâche (mesurées : analyse ≈ 8,5 k, bilan Opus ≈ 14 k). */
export const TASK_ESTIMATE = { generation: 9_000, judge: 16_000, weekly: 15_000 } as const;

export type RateWindow = { window: string; utilization: number | null; resetsAt: string | null; status: string };

export type BudgetDecision = { ok: true } | { ok: false; reason: string };

function readConfigNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function budgetFromEnv(env: Record<string, string | undefined>): BudgetConfig {
  return {
    nightTokens: readConfigNumber(env.BENCH_NIGHT_BUDGET_TOKENS, DEFAULT_BUDGET.nightTokens),
    weekTokens: readConfigNumber(env.BENCH_WEEK_BUDGET_TOKENS, DEFAULT_BUDGET.weekTokens),
    maxUtilization: {
      fiveHour: readConfigNumber(env.BENCH_MAX_FIVE_HOUR_UTILIZATION, DEFAULT_BUDGET.maxUtilization.fiveHour),
      sevenDay: readConfigNumber(env.BENCH_MAX_SEVEN_DAY_UTILIZATION, DEFAULT_BUDGET.maxUtilization.sevenDay),
    },
  };
}

/** Utilisation exprimée en 0–1, que le SDK la donne en fraction ou en pourcentage. */
function fraction(value: number): number {
  return value > 1 ? value / 100 : value;
}

export function canSpend(input: { estimate: number; nightUsed: number; weekUsed: number; config: BudgetConfig; windows: RateWindow[]; now: Date }): BudgetDecision {
  const { estimate, nightUsed, weekUsed, config } = input;
  if (nightUsed + estimate > config.nightTokens) return { ok: false, reason: `plafond de la nuit atteint (${nightUsed} + ${estimate} > ${config.nightTokens} tokens)` };
  if (weekUsed + estimate > config.weekTokens) return { ok: false, reason: `plafond de la semaine atteint (${weekUsed} + ${estimate} > ${config.weekTokens} tokens)` };
  for (const window of input.windows) {
    // Une fenêtre déjà réinitialisée ne dit plus rien.
    if (window.resetsAt && new Date(window.resetsAt) <= input.now) continue;
    if (window.status === "rejected") return { ok: false, reason: `quota atteint (${window.window})` };
    // Alerte sans pourcentage : on ne sait pas où on en est, on s'arrête par prudence.
    if (window.utilization == null) {
      if (window.status === "allowed_warning") return { ok: false, reason: `quota ${window.window} proche de la limite (alerte de Claude)` };
      continue;
    }
    const limit = window.window.startsWith("seven_day") ? config.maxUtilization.sevenDay : config.maxUtilization.fiveHour;
    if (fraction(window.utilization) >= limit) return { ok: false, reason: `quota ${window.window} à ${Math.round(fraction(window.utilization) * 100)} % (seuil ${Math.round(limit * 100)} %)` };
  }
  return { ok: true };
}
