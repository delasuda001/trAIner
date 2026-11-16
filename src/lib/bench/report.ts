import { CRITERIA, type ResolvedVerdict } from "./judge";

/** Rapport lisible d'une variante face à la version en place. Fonctions pures. */

export type SideStats = { deterministic: number; judge: number | null; inputTokens: number; outputTokens: number; guardFailures: number; count: number };

export type VariantReport = {
  variant: string;
  description: string;
  date: string;
  baseline: SideStats;
  candidate: SideStats;
  byCriterion: Array<{ criterion: string; baseline: number; variant: number }>;
  preferences: { baseline: number; variant: number; equal: number };
  recommendation: "adopter" | "rejeter" | "à creuser";
  why: string;
  verdicts: ResolvedVerdict[];
  overall: string;
};

function mean(values: number[]): number {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
}

export function judgeAverage(scores: Record<string, number>): number {
  return mean(CRITERIA.map((criterion) => scores[criterion]));
}

/**
 * Adopter : qualité au moins égale (juge à −0,1 près, pas plus d'échecs du garde-fou) et au moins
 * 10 % de tokens en moins, ou nettement meilleure (+0,3) pour au plus 10 % de tokens en plus.
 * Rejeter : moins bonne de plus de 0,2 ou plus d'échecs du garde-fou. Sinon : à creuser.
 */
export function recommend(baseline: SideStats, candidate: SideStats): { recommendation: VariantReport["recommendation"]; why: string } {
  const quality = (candidate.judge ?? 0) - (baseline.judge ?? 0);
  const tokensOf = (side: SideStats) => side.inputTokens + side.outputTokens;
  const tokenChange = tokensOf(baseline) ? (tokensOf(candidate) - tokensOf(baseline)) / tokensOf(baseline) : 0;
  const pct = `${tokenChange >= 0 ? "+" : "−"}${Math.abs(Math.round(tokenChange * 100))} % de tokens`;
  const delta = `${quality >= 0 ? "+" : "−"}${Math.abs(Math.round(quality * 100) / 100)} au juge`;
  if (candidate.guardFailures > baseline.guardFailures || quality < -0.2) return { recommendation: "rejeter", why: `${delta}, ${pct}, ${candidate.guardFailures} échec(s) du garde-fou contre ${baseline.guardFailures}.` };
  if ((quality >= -0.1 && tokenChange <= -0.1) || (quality >= 0.3 && tokenChange <= 0.1)) return { recommendation: "adopter", why: `${delta}, ${pct}.` };
  return { recommendation: "à creuser", why: `${delta}, ${pct} : écart trop faible pour trancher.` };
}

export function renderReport(report: VariantReport): string {
  const tokenLine = (side: SideStats) => `${side.inputTokens} en entrée, ${side.outputTokens} en sortie (moyenne par séance)`;
  const lines = [
    `# Banc — variante « ${report.variant} » (${report.date})`,
    "",
    report.description,
    "",
    `**Recommandation : ${report.recommendation}.** ${report.why} Le banc propose ; rien n'est appliqué sans validation.`,
    "",
    "| | En place | Variante |",
    "| --- | --- | --- |",
    `| Note déterministe (sur 100) | ${report.baseline.deterministic} | ${report.candidate.deterministic} |`,
    `| Note du juge (sur 5) | ${report.baseline.judge ?? "—"} | ${report.candidate.judge ?? "—"} |`,
    ...report.byCriterion.map((row) => `| — ${row.criterion} | ${row.baseline} | ${row.variant} |`),
    `| Échecs du garde-fou | ${report.baseline.guardFailures} / ${report.baseline.count} | ${report.candidate.guardFailures} / ${report.candidate.count} |`,
    `| Tokens | ${tokenLine(report.baseline)} | ${tokenLine(report.candidate)} |`,
    "",
    `Préférences du juge : en place ${report.preferences.baseline}, variante ${report.preferences.variant}, égal ${report.preferences.equal}.`,
    "",
    "## Par séance",
    "",
    ...report.verdicts.map((verdict) => `- **${verdict.fixture}** : préféré ${verdict.preferred} — ${verdict.comment}`),
    "",
    "## Synthèse du juge",
    "",
    report.overall,
    "",
  ];
  return lines.join("\n");
}
