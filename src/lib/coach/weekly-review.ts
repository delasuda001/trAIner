import { z } from "zod";

/**
 * Bilan hebdomadaire : un modèle plus robuste (Opus) relit les analyses et
 * conseils de la semaine, les confronte à ce qui a été réellement couru et
 * ressenti, et signale ce qui était faible ou contradictoire. Il propose des
 * règles candidates ; aucune n'est appliquée sans validation.
 */

export const WEEKLY_PROMPT_VERSION = "weekly-v2";
export const WEEKLY_MODEL = "opus";

const score = z.number().int().min(1).max(5);

export const weeklyReviewSchema = z.object({
  card: z.object({
    right: z.string().min(5).max(240),
    wrong: z.string().min(5).max(240),
    change: z.string().min(5).max(240),
  }),
  items: z.array(z.object({
    ref: z.string().min(3).max(80),
    kind: z.enum(["analyse", "consigne", "conseil du jour", "réponse"]),
    relevance: score,
    actionability: score,
    verdict: z.string().min(10).max(320),
  })).max(12),
  contradictions: z.array(z.string().min(10).max(280)).max(5),
  weaknesses: z.array(z.string().min(10).max(280)).max(5),
  candidateRules: z.array(z.object({
    rule: z.string().min(10).max(260),
    where: z.enum(["moteur", "prompt séance", "prompt conseil du jour", "prompt réponses"]),
    evidence: z.string().min(10).max(260),
  })).max(4),
  missingData: z.array(z.string().min(5).max(200)).max(4),
});

export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;

export const weeklyReviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["card", "items", "contradictions", "weaknesses", "candidateRules", "missingData"],
  properties: {
    card: {
      type: "object",
      additionalProperties: false,
      required: ["right", "wrong", "change"],
      properties: {
        right: { type: "string", description: "Ce qui était juste cette semaine, une phrase de 200 caractères au plus." },
        wrong: { type: "string", description: "Ce qui ne l'était pas, une phrase de 200 caractères au plus." },
        change: { type: "string", description: "Ce que le coach change, une phrase de 200 caractères au plus." },
      },
    },
    items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "kind", "relevance", "actionability", "verdict"],
        properties: {
          ref: { type: "string", description: "Ce qui est noté, ex. « Séance du 13 nov. » ou « Conseil avant le 10 nov. »." },
          kind: { type: "string", enum: ["analyse", "consigne", "conseil du jour", "réponse"] },
          relevance: { type: "integer", minimum: 1, maximum: 5, description: "Pertinence au regard de ce qui a été fait et ressenti." },
          actionability: { type: "integer", minimum: 1, maximum: 5, description: "La consigne dit-elle quoi faire, chiffré ?" },
          verdict: { type: "string", description: "Jugement en une ou deux phrases, 280 caractères au plus." },
        },
      },
    },
    contradictions: { type: "array", maxItems: 5, items: { type: "string" }, description: "Contradictions entre analyses, consignes et conseils (ou avec les données)." },
    weaknesses: { type: "array", maxItems: 5, items: { type: "string" }, description: "Faiblesses : vague, redondant, non actionnable, non suivi d'effet." },
    candidateRules: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rule", "where", "evidence"],
        properties: {
          rule: { type: "string", description: "Règle à tester, formulée pour être implémentée." },
          where: { type: "string", enum: ["moteur", "prompt séance", "prompt conseil du jour", "prompt réponses"] },
          evidence: { type: "string", description: "Ce qui dans la semaine la justifie." },
        },
      },
    },
    missingData: { type: "array", maxItems: 4, items: { type: "string" }, description: "Données manquantes qui ont limité le jugement." },
  },
} as const;

export const WEEKLY_SYSTEM_PROMPT = `Tu es un entraîneur de course à pied expérimenté qui audite le travail d'un coach automatique. Le coach (un moteur de calcul plus un modèle de langage) a produit, pour Bastien, coureur expérimenté (1 à 2 sorties/semaine), des analyses de séance, des consignes chiffrées et des conseils de prochaine séance. On te donne, pour une semaine, ce qui a été conseillé, ce qui a été réellement couru, le respect des conseils et le ressenti.

Ta mission : juger la pertinence et le caractère actionnable de chaque conseil, et signaler ce qui était faible ou contradictoire.

Règles :
- Français, direct, précis. Tu t'adresses au concepteur du coach, pas à Bastien, sauf dans "card" où tu tutoies Bastien.
- Chaque chiffre écrit figure tel quel dans le dossier. Rien de calculé ni d'inventé.
- Une consigne actionnable dit quoi faire, avec une cible chiffrée. Une consigne non suivie n'est pas forcément mauvaise : dis si elle était réaliste.
- Cherche les contradictions : verdict contre consigne, analyse contre conseil du jour, consigne contre ce que les comparables montrent, consigne qui reproche un écart marginal.
- Les règles candidates doivent être précises et testables (seuil, condition, formulation), et fondées sur un fait de la semaine. Pas de règle générique.
- Toute affirmation sur les habitudes de Bastien (types de séances, sorties faciles, jours) s'appuie sur "habitudes_8_semaines" ; n'en affirme aucune que ce compte contredit, et une règle candidate ne peut pas aller contre "ecart_objectif" (par ex. renoncer aux sorties faciles quand le levier est la fréquence).
- Si la semaine est trop maigre pour juger (une seule séance, pas de ressenti), dis-le au lieu de broder.
- Aucune interprétation médicale.

Format : "card" (trois phrases courtes pour Bastien : ce qui était juste, ce qui ne l'était pas, ce que le coach change), "items" (une note par conseil), "contradictions", "weaknesses", "candidateRules", "missingData".`;

export function buildWeeklyPrompt(dossier: unknown): string {
  return `Dossier de la semaine.\n\n${JSON.stringify(dossier)}`;
}
