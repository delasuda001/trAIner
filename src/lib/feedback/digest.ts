import type { FeedbackCategory, FeedbackRecord } from "@/lib/profiles/registry";

/**
 * Consolidation des retours des testeurs, sans appel à Claude : regroupement par
 * thème (catégorie × écran), bilan des pouces par type d'analyse, export Markdown.
 * Fonctions pures, testées.
 */

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  besoin: "Besoins",
  idee: "Idées",
  bug: "Ce qui ne marche pas",
  donnees: "Données",
  analyse: "Le coach",
  autre: "Autre",
};

const CATEGORY_ORDER: FeedbackCategory[] = ["besoin", "bug", "idee", "analyse", "donnees", "autre"];

export function screenOf(page: string): string {
  if (page === "/" || page === "") return "Tableau de bord";
  if (page.startsWith("/activities")) return "Séance";
  if (page.startsWith("/coach")) return "Demander au coach";
  if (page.startsWith("/objectif")) return "Objectif";
  if (page.startsWith("/parametres")) return "Paramètres";
  if (page.startsWith("/bienvenue")) return "Accueil";
  if (page.startsWith("/bilan")) return "Bilan";
  return page;
}

const SUBJECT_LABELS: Record<string, string> = { session: "Analyses de séance", outlook: "Conseils du jour", chat: "Réponses aux questions" };

export type Theme = { category: FeedbackCategory; screen: string; entries: FeedbackRecord[] };
export type RatingStat = { subjectKind: string; label: string; up: number; down: number; byPrompt: Array<{ promptVersion: string; up: number; down: number }> };

export type Digest = {
  total: number;
  notes: number;
  byProfile: Array<{ profileId: string; count: number }>;
  themes: Theme[];
  ratings: RatingStat[];
};

export function digestFeedback(records: FeedbackRecord[]): Digest {
  const withNote = records.filter((record) => record.note.trim().length > 0);
  const themeMap = new Map<string, Theme>();
  for (const record of withNote) {
    const screen = screenOf(record.page);
    const key = `${record.category}|${screen}`;
    const theme = themeMap.get(key) ?? { category: record.category, screen, entries: [] };
    theme.entries.push(record);
    themeMap.set(key, theme);
  }
  const themes = [...themeMap.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || b.entries.length - a.entries.length || a.screen.localeCompare(b.screen));

  const ratingMap = new Map<string, RatingStat>();
  for (const record of records) {
    if (record.rating == null || !record.subjectKind) continue;
    const stat = ratingMap.get(record.subjectKind) ?? { subjectKind: record.subjectKind, label: SUBJECT_LABELS[record.subjectKind] ?? record.subjectKind, up: 0, down: 0, byPrompt: [] };
    if (record.rating === 1) stat.up += 1; else stat.down += 1;
    const version = record.promptVersion ?? "—";
    const prompt = stat.byPrompt.find((entry) => entry.promptVersion === version) ?? (stat.byPrompt[stat.byPrompt.push({ promptVersion: version, up: 0, down: 0 }) - 1]);
    if (record.rating === 1) prompt.up += 1; else prompt.down += 1;
    ratingMap.set(record.subjectKind, stat);
  }

  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.profileId, (counts.get(record.profileId) ?? 0) + 1);
  return {
    total: records.length,
    notes: withNote.length,
    byProfile: [...counts.entries()].map(([profileId, count]) => ({ profileId, count })).sort((a, b) => b.count - a.count),
    themes,
    ratings: [...ratingMap.values()],
  };
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

/** Export à coller dans une conversation : thèmes, citations, pouces. */
export function digestMarkdown(digest: Digest, names: Map<string, string>, generatedAt: string): string {
  const lines: string[] = [`# Retours des testeurs de Sillage (${day(generatedAt)})`, ""];
  lines.push(`${digest.total} retour(s), dont ${digest.notes} avec une note. Par personne : ${digest.byProfile.map((entry) => `${names.get(entry.profileId) ?? entry.profileId} ${entry.count}`).join(", ") || "aucun"}.`, "");
  if (digest.ratings.length) {
    lines.push("## Pouces sur le coach", "");
    for (const stat of digest.ratings) lines.push(`- ${stat.label} : ${stat.up} utile(s), ${stat.down} pas utile(s)${stat.byPrompt.length > 1 || stat.byPrompt[0]?.promptVersion !== "—" ? ` (${stat.byPrompt.map((entry) => `${entry.promptVersion} ${entry.up}/${entry.down}`).join(", ")})` : ""}`);
    lines.push("");
  }
  let current: FeedbackCategory | null = null;
  for (const theme of digest.themes) {
    if (theme.category !== current) {
      lines.push(`## ${CATEGORY_LABELS[theme.category]}`, "");
      current = theme.category;
    }
    lines.push(`### ${theme.screen} (${theme.entries.length})`, "");
    for (const entry of theme.entries) {
      const rating = entry.rating === 1 ? " 👍" : entry.rating === -1 ? " 👎" : "";
      lines.push(`- ${names.get(entry.profileId) ?? entry.profileId}, ${day(entry.createdAt)}${rating} : ${entry.note.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
