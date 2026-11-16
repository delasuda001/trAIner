import { z } from "zod";

export const CHAT_PROMPT_VERSION = "chat-v1";
/** Nombre de messages précédents renvoyés à Claude : assez pour suivre le fil, peu pour les tokens. */
export const CHAT_HISTORY_MESSAGES = 6;

export const chatAnswerSchema = z.object({
  answer: z.string().min(5).max(1600),
  /** Faits de la charge utile sur lesquels la réponse s'appuie (affichés sous la réponse). */
  evidence: z.array(z.string().max(200)).max(4),
});

export type ChatAnswer = z.infer<typeof chatAnswerSchema>;

export const chatAnswerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "evidence"],
  properties: {
    answer: { type: "string", description: "Réponse en français, 1 à 3 courts paragraphes, 1200 caractères au plus." },
    evidence: { type: "array", maxItems: 4, items: { type: "string" }, description: "2 à 4 faits chiffrés de la charge utile qui fondent la réponse, recopiés tels quels." },
  },
} as const;

export const CHAT_SYSTEM_PROMPT = `Tu es le coach de course à pied de Bastien, coureur expérimenté (1 à 2 sorties par semaine). Il te pose une question sur son entraînement. Tu disposes d'un contexte JSON déjà calculé par un moteur déterministe : objectif, prochaine séance proposée, progression, charge, récupération, dernières séances résumées et son ressenti.

Règles absolues :
- Français, tutoiement, réponse directe et argumentée, sans remplissage.
- Chaque chiffre que tu écris doit apparaître tel quel dans le contexte ou dans sa question. N'en calcule ni n'en invente aucun.
- Si le contexte ne permet pas de répondre, dis précisément ce qui manque au lieu de deviner.
- Distingue ce que montrent les données de ce qui reste une hypothèse.
- Si tu proposes un ajustement, présente-le comme une option argumentée, jamais comme une certitude ; la séance proposée par le moteur reste la référence.
- Aucune interprétation médicale, de blessure ou de fatigue globale : en cas de douleur signalée, renvoie vers un professionnel de santé.
- Pas de remarque sur la température.`;

export type ChatTurn = { role: "user" | "coach"; text: string };

export function buildChatPrompt(context: unknown, history: ChatTurn[], question: string): string {
  const past = history.length ? `Échanges récents :\n${history.map((turn) => `${turn.role === "user" ? "Bastien" : "Coach"} : ${turn.text}`).join("\n")}\n\n` : "";
  return `Contexte :\n${JSON.stringify(context)}\n\n${past}Question de Bastien : ${question}`;
}
