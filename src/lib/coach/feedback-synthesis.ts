import { z } from "zod";

/**
 * Synthèse des retours des testeurs par Claude, sur bouton seulement (vue de Bastien).
 * Entrée compacte : les notes regroupées par thème, prénoms seulement, sans aucune
 * donnée d'entraînement. Sortie validée par Zod.
 */
export const FEEDBACK_PROMPT_VERSION = "feedback-v2";
/** Au-delà, les notes les plus anciennes sont écartées (coût maîtrisé : ~5 à 8 k tokens). */
export const FEEDBACK_MAX_CHARS = 9_000;

export const feedbackSynthesisSchema = z.object({
  summary: z.string().min(5).max(600),
  themes: z.array(z.object({
    title: z.string().max(80),
    who: z.string().max(80),
    need: z.string().max(300),
    proposal: z.string().max(300),
    priority: z.enum(["haute", "moyenne", "basse"]),
  })).max(8),
  coachQuality: z.string().max(400),
  questions: z.array(z.string().max(200)).max(4),
});
export type FeedbackSynthesis = z.infer<typeof feedbackSynthesisSchema>;

export const feedbackSynthesisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "themes", "coachQuality", "questions"],
  properties: {
    summary: { type: "string", description: "Deux ou trois phrases : ce que les testeurs disent dans l'ensemble." },
    themes: {
      type: "array", maxItems: 8,
      items: {
        type: "object", additionalProperties: false, required: ["title", "who", "need", "proposal", "priority"],
        properties: {
          title: { type: "string", description: "Nom court du thème." },
          who: { type: "string", description: "Prénoms des testeurs concernés." },
          need: { type: "string", description: "Le besoin réel derrière les retours, en une phrase." },
          proposal: { type: "string", description: "Piste concrète pour l'application (une phrase), sans promettre." },
          priority: { type: "string", enum: ["haute", "moyenne", "basse"] },
        },
      },
    },
    coachQuality: { type: "string", description: "Ce que disent les pouces et notes sur les analyses du coach." },
    questions: { type: "array", maxItems: 4, items: { type: "string" }, description: "Questions à poser aux testeurs pour lever une ambiguïté." },
  },
} as const;

export const FEEDBACK_SYSTEM_PROMPT = `Tu aides Bastien, qui construit une application de coaching de course à pied, à exploiter les retours des personnes qui la testent (désignées par leur prénom). Tu reçois leurs retours regroupés par thème et le bilan des pouces sur les analyses du coach.

- Dégage les besoins réels derrière les remarques, regroupés en quelques thèmes, du plus important au moins important.
- Pour chaque thème : qui l'exprime, le besoin, une piste concrète pour l'application, une priorité.
- Reste fidèle aux retours : n'invente ni besoin ni chiffre. Si un retour est ambigu, pose la question dans "questions".
- Français, phrases courtes, sans jargon.`;

export function buildFeedbackPrompt(markdown: string): string {
  const trimmed = markdown.length > FEEDBACK_MAX_CHARS ? `${markdown.slice(0, FEEDBACK_MAX_CHARS)}\n[…retours plus anciens omis]` : markdown;
  return `Retours des testeurs :\n\n${trimmed}`;
}
