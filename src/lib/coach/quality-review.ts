import { z } from "zod";

/**
 * Relecteur indépendant des analyses du coach. Ce n'est PAS le coach qui se juge : autre prompt,
 * contexte vierge, rôle de second coach critique. Il reçoit, par profil, les repères de la personne
 * (zones, footings, seuil, rythme), les faits calculés par le moteur pour chaque séance et le texte
 * affiché, et signale ce qui est faux, contradictoire ou inutile POUR CETTE PERSONNE.
 * Lancé par lots (jamais après chaque analyse), avec un modèle économe ; ses constats vont dans la
 * vue admin et les récurrents deviennent des règles déterministes (lib/quality/coherence.ts).
 */

export const REVIEW_PROMPT_VERSION = "review-v1";
export const REVIEW_MODEL = "haiku";
/** Cas relus par appel (un appel par profil) : borne le coût d'un lot. */
export const REVIEW_MAX_CASES = 6;

export const REVIEW_CATEGORIES = ["faux", "contradiction", "pas_adapte", "inutile", "ton", "frontiere_medicale"] as const;

export const reviewSchema = z.object({
  findings: z.array(z.object({
    case_id: z.string().min(1).max(80),
    severity: z.enum(["error", "warning", "info"]),
    category: z.enum(REVIEW_CATEGORIES),
    quote: z.string().max(200),
    issue: z.string().min(5).max(300),
    rule_idea: z.string().max(240),
  })).max(20),
  summary: z.string().max(400),
});

export type ReviewOutput = z.infer<typeof reviewSchema>;

export const reviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["findings", "summary"],
  properties: {
    findings: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["case_id", "severity", "category", "quote", "issue", "rule_idea"],
        properties: {
          case_id: { type: "string", description: "Identifiant du cas, tel que donné." },
          severity: { type: "string", enum: ["error", "warning", "info"], description: "error : faux ou trompeur ; warning : discutable ou mal adapté ; info : amélioration." },
          category: { type: "string", enum: [...REVIEW_CATEGORIES] },
          quote: { type: "string", description: "Extrait exact du texte visé (200 caractères au plus), vide si le défaut est une absence." },
          issue: { type: "string", description: "Le problème, chiffré à partir des faits fournis (300 caractères au plus)." },
          rule_idea: { type: "string", description: "Règle vérifiable en code qui l'aurait évité, déclenchée par les données et jamais propre à un profil ; vide si aucune." },
        },
      },
    },
    summary: { type: "string", description: "Ce qui revient d'un cas à l'autre, 400 caractères au plus ; vide si rien." },
  },
} as const;

export const REVIEW_SYSTEM_PROMPT = `Tu es un entraîneur de course à pied expérimenté, appelé comme second avis indépendant. Un coach automatique a écrit des analyses de séance et un conseil du jour pour un coureur. Tu n'as pas écrit ces textes : ton rôle est de trouver ce qui ne va pas, pour CE coureur, à partir de ses repères et des faits calculés fournis.

Signale uniquement des problèmes concrets :
- faux : un chiffre, une zone, une comparaison ou une cause qui contredit les faits fournis ;
- contradiction : deux affirmations incompatibles (entre elles, ou avec les repères du coureur) ;
- pas_adapte : une consigne irréaliste ou inutile pour son niveau et ses habitudes (ex. allure facile très éloignée de ce qu'il court, durée sans rapport avec ses sorties) ;
- inutile : une case qui ne dit rien d'actionnable alors que les faits permettaient de dire quelque chose ;
- ton : condescendant, alarmiste, flatteur, ou jargon de système ;
- frontiere_medicale : jugement sur la fatigue, la forme, une blessure ou la santé de la personne.

Règles :
- Appuie-toi uniquement sur les faits fournis ; n'invente aucune donnée.
- Une préférence de style n'est pas un problème. Pas plus de 3 constats par cas ; aucun si le cas est correct.
- Ne recommande jamais une norme universelle (cadence, zones) : les repères du coureur font foi.
- Pour chaque constat, propose si possible une règle vérifiable en code, générale (déclenchée par les données), jamais propre à une personne.
- Réponds en français, phrases courtes et chiffrées.`;

export type ReviewCase = {
  id: string;
  type: "séance" | "conseil du jour";
  faits: unknown;
  texte_affiche: string[];
};

export type ReviewDossier = {
  coureur: Record<string, unknown>;
  cas: ReviewCase[];
};

export function buildReviewPrompt(dossier: ReviewDossier): string {
  return `Repères du coureur et cas à relire (JSON) :\n${JSON.stringify(dossier)}\n\nRelis chaque cas et renvoie tes constats au format demandé.`;
}
