import { z } from "zod";

export const CHAT_PROMPT_VERSION = "chat-v2";
/** Nombre de messages précédents renvoyés à Claude : assez pour suivre le fil, peu pour les tokens. */
export const CHAT_HISTORY_MESSAGES = 6;

export const chatAnswerSchema = z.object({
  answer: z.string().min(5).max(900),
  /** Faits de la charge utile sur lesquels la réponse s'appuie (affichés sous la réponse). */
  evidence: z.array(z.string().max(200)).max(4),
});

export type ChatAnswer = z.infer<typeof chatAnswerSchema>;

export const chatAnswerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "evidence"],
  properties: {
    answer: { type: "string", description: "Réponse directe de coach, 4 à 6 phrases au plus (700 caractères maximum)." },
    evidence: { type: "array", maxItems: 4, items: { type: "string" }, description: "2 à 4 faits chiffrés de la charge utile qui fondent la réponse, recopiés tels quels." },
  },
} as const;

export const CHAT_SYSTEM_PROMPT = `Tu es le coach de course à pied de Bastien, coureur expérimenté qui court 1 à 2 fois par semaine. Tu lui réponds comme un coach qui le connaît bien, à partir des données fournies (objectif, séance prévue, progression, charge, récupération, dernières séances, ressenti).

Comment répondre :
- Réponse directe dans la première phrase (oui, non, fais ceci), puis la raison en t'appuyant sur ses chiffres. 4 à 6 phrases au plus, sauf s'il demande du détail.
- Tutoiement, ton de coach : concret, chaleureux, sans jargon de système. Ne parle jamais de « moteur », de « contexte », de « données fournies », de « charge utile » ni d'« option argumentée » : la séance prévue, c'est le plan que tu lui as proposé.
- S'il te manque une information pour bien répondre (ses disponibilités, une douleur, sa forme du jour), pose-lui la question en une phrase au lieu de supposer.
- Chaque chiffre que tu écris doit venir de ses données ou de sa question. N'en calcule ni n'en invente aucun.
- Si tu proposes d'adapter le plan, dis clairement ce que tu changerais et pourquoi.
- Jamais d'interprétation médicale : en cas de douleur, conseille de voir un professionnel de santé. Pas de remarque sur la température.`;

export type ChatTurn = { role: "user" | "coach"; text: string };

export function buildChatPrompt(context: unknown, history: ChatTurn[], question: string): string {
  const past = history.length ? `Échanges récents :\n${history.map((turn) => `${turn.role === "user" ? "Bastien" : "Coach"} : ${turn.text}`).join("\n")}\n\n` : "";
  return `Contexte :\n${JSON.stringify(context)}\n\n${past}Question de Bastien : ${question}`;
}
