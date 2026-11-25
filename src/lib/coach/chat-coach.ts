import { z } from "zod";

export const CHAT_PROMPT_VERSION = "chat-v4";
/** Nombre de messages précédents renvoyés à Claude : assez pour suivre le fil, peu pour les tokens. */
export const CHAT_HISTORY_MESSAGES = 6;

export const chatAnswerSchema = z.object({
  answer: z.string().min(5).max(900),
  /** Faits de la charge utile sur lesquels la réponse s'appuie (affichés sous la réponse). */
  evidence: z.array(z.string().max(200)).max(4),
  /**
   * Contrainte de la semaine annoncée par le coureur (« seulement 2 séances », « pas mardi ») : le plan est
   * recalculé par l'application. `apply` faux si la question n'en annonce aucune.
   */
  planChange: z.object({
    apply: z.boolean(),
    runsThisWeek: z.number().int().min(0).max(14),
    unavailableDays: z.array(z.enum(["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"])).max(7),
  }).optional(),
});

export type ChatAnswer = z.infer<typeof chatAnswerSchema>;

export const chatAnswerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "evidence", "planChange"],
  properties: {
    answer: { type: "string", description: "Réponse directe de coach, 4 à 6 phrases au plus (700 caractères maximum)." },
    evidence: { type: "array", maxItems: 4, items: { type: "string" }, description: "2 à 4 faits chiffrés de la charge utile qui fondent la réponse, recopiés tels quels." },
    planChange: {
      type: "object",
      additionalProperties: false,
      required: ["apply", "runsThisWeek", "unavailableDays"],
      description: "Contrainte pour CETTE semaine annoncée dans la question (sorties possibles, jours sans course). apply=false si aucune.",
      properties: {
        apply: { type: "boolean", description: "true seulement si la question annonce une contrainte de disponibilité pour cette semaine." },
        runsThisWeek: { type: "integer", description: "Nombre total de sorties possibles cette semaine (celles déjà faites comprises) ; 0 si non dit." },
        unavailableDays: { type: "array", items: { type: "string", enum: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] }, description: "Jours de cette semaine où il ne peut pas courir ; vide si non dit." },
      },
    },
  },
} as const;

export const CHAT_SYSTEM_PROMPT = `Tu es le coach de course à pied de Bastien, coureur expérimenté qui court 1 à 2 fois par semaine. Tu lui réponds comme un coach qui le connaît bien, à partir des données fournies (objectif, séance prévue, progression, charge, récupération, dernières séances, ressenti).

Comment répondre :
- Réponse directe dans la première phrase (oui, non, fais ceci), puis la raison en t'appuyant sur ses chiffres. 4 à 6 phrases au plus, sauf s'il demande du détail.
- Tutoiement, ton de coach : concret, chaleureux, sans jargon de système. Ne parle jamais de « moteur », de « contexte », de « données fournies », de « charge utile » ni d'« option argumentée » : la séance prévue, c'est le plan que tu lui as proposé.
- S'il te manque une information pour bien répondre (ses disponibilités, une douleur, sa forme du jour), pose-lui la question en une phrase au lieu de supposer.
- Chaque chiffre que tu écris doit venir de ses données ou de sa question. N'en calcule ni n'en invente aucun.
- Si tu proposes d'adapter le plan, dis clairement ce que tu changerais et pourquoi.
- S'il annonce une contrainte pour cette semaine (nombre de sorties possibles, jours où il ne peut pas courir), remplis "planChange" (apply=true) : l'application recalcule aussitôt sa prochaine séance et la lui montre. Dans ta réponse, dis comment tu répartirais ses sorties restantes. Sinon apply=false. Ne remplis jamais "planChange" de ta propre initiative.
- "tableau_de_bord" (jauges de l'objectif, leviers, semaine type) n'est présent que si la question en parle : appuie-toi dessus pour répondre sur sa progression vers l'objectif.
- Si "seance_choisie" est présente, la question porte sur cette séance : appuie-toi d'abord sur elle (ressenti, verdict, consignes, ce que tu en as déjà dit) pour expliquer ou discuter, sans réécrire toute l'analyse.
- Jamais d'interprétation médicale : en cas de douleur, conseille de voir un professionnel de santé. Pas de remarque sur la température.`;

export type ChatTurn = { role: "user" | "coach"; text: string };

export function buildChatPrompt(context: unknown, history: ChatTurn[], question: string, asker = "Bastien"): string {
  const past = history.length ? `Échanges récents :\n${history.map((turn) => `${turn.role === "user" ? asker : "Coach"} : ${turn.text}`).join("\n")}\n\n` : "";
  return `Contexte :\n${JSON.stringify(context)}\n\n${past}Question de ${asker} : ${question}`;
}
