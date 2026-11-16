/**
 * Les consignes du coach ont été écrites pour Bastien (1 à 2 sorties par semaine).
 * Pour un autre profil, on remplace la phrase de présentation par une phrase
 * neutre qui donne son rythme réel (sur 12 semaines). Pour Bastien, le texte
 * reste identique à l'octet près (aucune réponse en cache invalidée).
 */

export type AthleteForPrompt = { isAdmin: boolean; runsPerWeek12w: number | null };

const INTRODUCTIONS = [
  "Tu es le coach de course de Bastien, coureur expérimenté (1 à 2 sorties/semaine).",
  "Tu es le coach de course à pied de Bastien, coureur expérimenté qui court 1 à 2 fois par semaine.",
] as const;

/** Rythme en entier (1 à 12, chiffres tolérés par le contrôle des chiffres). */
export function rhythmPhrase(runsPerWeek12w: number | null): string {
  if (runsPerWeek12w == null || runsPerWeek12w <= 0) return "dont le rythme d'entraînement n'est pas encore connu";
  const rounded = Math.min(12, Math.max(1, Math.round(runsPerWeek12w)));
  return `qui court environ ${rounded} fois par semaine (moyenne des 12 dernières semaines)`;
}

export function systemPromptFor(base: string, athlete: AthleteForPrompt): string {
  if (athlete.isAdmin) return base;
  const intro = INTRODUCTIONS.find((candidate) => base.includes(candidate));
  if (!intro) throw new Error("Consigne du coach : phrase de présentation introuvable, mettre à jour coach/athlete.ts.");
  return base.replace(intro, `Tu es le coach de course à pied d'un coureur expérimenté ${rhythmPhrase(athlete.runsPerWeek12w)}. Tu le tutoies.`);
}

/** Prénom utilisé dans le fil de questions (« Question de … »). */
export function askerLabel(athlete: AthleteForPrompt): string {
  return athlete.isAdmin ? "Bastien" : "l'athlète";
}
