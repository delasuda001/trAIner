/** Agrégats de consommation Claude pour la page Paramètres (fonctions pures, testées). */

export type UsageRecord = {
  createdAt: string;
  kind: string;
  subject: string | null;
  model: string;
  outcome: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number | null;
  durationMs: number | null;
};

export type UsageTotals = { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; totalTokens: number; costUsd: number };

export type UsageSummary = {
  today: UsageTotals;
  last7Days: UsageTotals;
  last30Days: UsageTotals;
  byKind: Array<{ kind: string; calls: number; averageTokens: number; totalTokens: number }>;
  averagePerAnalysis: number | null;
  averagePerQuestion: number | null;
};

export function totalTokens(record: Pick<UsageRecord, "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheCreationTokens">): number {
  return record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheCreationTokens;
}

function totals(records: UsageRecord[]): UsageTotals {
  return records.reduce<UsageTotals>((sum, record) => ({
    calls: sum.calls + 1,
    inputTokens: sum.inputTokens + record.inputTokens,
    outputTokens: sum.outputTokens + record.outputTokens,
    cacheReadTokens: sum.cacheReadTokens + record.cacheReadTokens,
    cacheCreationTokens: sum.cacheCreationTokens + record.cacheCreationTokens,
    totalTokens: sum.totalTokens + totalTokens(record),
    costUsd: sum.costUsd + (record.costUsd ?? 0),
  }), { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, costUsd: 0 });
}

function average(records: UsageRecord[]): number | null {
  return records.length ? Math.round(records.reduce((sum, record) => sum + totalTokens(record), 0) / records.length) : null;
}

/** `startOfToday` : minuit local en ISO, pour que « aujourd'hui » suive le fuseau de l'utilisateur. */
export function summarizeUsage(records: UsageRecord[], now: Date, startOfToday: string): UsageSummary {
  const since = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const kinds = [...new Set(records.map((record) => record.kind))];
  return {
    today: totals(records.filter((record) => record.createdAt >= startOfToday)),
    last7Days: totals(records.filter((record) => record.createdAt >= since(7))),
    last30Days: totals(records.filter((record) => record.createdAt >= since(30))),
    byKind: kinds.map((kind) => {
      const list = records.filter((record) => record.kind === kind);
      const sum = totals(list);
      return { kind, calls: sum.calls, totalTokens: sum.totalTokens, averageTokens: Math.round(sum.totalTokens / Math.max(1, sum.calls)) };
    }).sort((a, b) => b.totalTokens - a.totalTokens),
    averagePerAnalysis: average(records.filter((record) => record.kind === "session")),
    averagePerQuestion: average(records.filter((record) => record.kind === "chat")),
  };
}
