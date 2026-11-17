import type { WeeklyReview } from "@/lib/coach/weekly-review";

/** Bilan hebdomadaire tel qu'exporté (outil interne de réglage, pour le coordinateur). */
export type ExportableWeeklyReview = { weekStart: string; output: WeeklyReview; model: string; createdAt: string; promptVersion: string };

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Export Markdown des bilans, plus récents d'abord. Fonction pure, testée. */
export function weeklyReviewsMarkdown(reviews: ExportableWeeklyReview[], generatedAt: string): string {
  const lines: string[] = ["# Sillage : le coach relit ses semaines", "", `Export du ${generatedAt.slice(0, 10)} · ${reviews.length} bilan${reviews.length > 1 ? "s" : ""}.`, ""];
  if (!reviews.length) lines.push("Aucun bilan pour l'instant.", "");
  for (const review of reviews) {
    const { output } = review;
    lines.push(`## Semaine du ${review.weekStart}`, "", `Modèle ${review.model} · prompt ${review.promptVersion} · produit le ${review.createdAt.slice(0, 16).replace("T", " ")}`, "");
    lines.push(`- **Juste :** ${output.card.right}`, `- **Pas juste :** ${output.card.wrong}`, `- **Ce que le coach change :** ${output.card.change}`, "");
    if (output.items.length) {
      lines.push("| Quoi | Type | Pertinence | Actionnable | Jugement |", "| --- | --- | --- | --- | --- |");
      for (const item of output.items) lines.push(`| ${cell(item.ref)} | ${item.kind} | ${item.relevance}/5 | ${item.actionability}/5 | ${cell(item.verdict)} |`);
      lines.push("");
    }
    const list = (title: string, entries: string[]) => {
      if (!entries.length) return;
      lines.push(`### ${title}`, "", ...entries.map((entry) => `- ${entry}`), "");
    };
    list("Contradictions", output.contradictions);
    list("Faiblesses", output.weaknesses);
    list("Règles proposées (non appliquées)", output.candidateRules.map((rule) => `**${rule.where} :** ${rule.rule} (${rule.evidence})`));
    list("Données manquantes", output.missingData);
  }
  return lines.join("\n");
}
