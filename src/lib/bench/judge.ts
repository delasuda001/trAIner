import { createHash } from "node:crypto";
import { z } from "zod";
import type { SessionCoachOutput } from "@/lib/coach/session-coach";

/**
 * Juge du banc (Opus) : compare, séance par séance, la sortie de la version en
 * place et celle d'une variante, présentées sous les étiquettes A et B dans un
 * ordre tiré de façon déterministe (pour ne pas favoriser une position).
 */

export const JUDGE_PROMPT_VERSION = "judge-v2";
export const JUDGE_MODEL = "opus";
export const CRITERIA = ["exactitude", "comparaison", "actionnable", "ton", "concision"] as const;
export type Criterion = (typeof CRITERIA)[number];

const scores = z.object(Object.fromEntries(CRITERIA.map((criterion) => [criterion, z.number().int().min(1).max(5)])) as Record<Criterion, z.ZodNumber>);

export const judgeSchema = z.object({
  verdicts: z.array(z.object({
    fixture: z.string(),
    A: scores,
    B: scores,
    preferred: z.enum(["A", "B", "égal"]),
    comment: z.string().min(5).max(260),
  })).min(1).max(10),
  overall: z.string().min(10).max(500),
});

export type JudgeOutput = z.infer<typeof judgeSchema>;

const scoreSchema = { type: "object", additionalProperties: false, required: [...CRITERIA], properties: Object.fromEntries(CRITERIA.map((criterion) => [criterion, { type: "integer", minimum: 1, maximum: 5 }])) };

export const judgeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts", "overall"],
  properties: {
    verdicts: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fixture", "A", "B", "preferred", "comment"],
        properties: { fixture: { type: "string" }, A: scoreSchema, B: scoreSchema, preferred: { type: "string", enum: ["A", "B", "égal"] }, comment: { type: "string", description: "Pourquoi, en une phrase de 200 caractères au plus." } },
      },
    },
    overall: { type: "string", description: "Défauts et qualités qui reviennent d'une séance à l'autre, SANS désigner A ou B (les étiquettes changent à chaque séance), 400 caractères au plus." },
  },
} as const;

export const JUDGE_SYSTEM_PROMPT = `Tu es un entraîneur de course à pied expérimenté qui évalue deux versions (A et B) d'un débrief de séance écrit par un coach automatique pour Bastien, coureur expérimenté. Pour chaque séance, on te donne les faits calculés par le moteur (référence) puis les deux débriefs.

Note chaque débrief de 1 à 5 sur :
- exactitude : fidèle aux faits du moteur, sans chiffre ni cause inventés, sans contradiction interne ;
- comparaison : la comparaison aux séances comparables est utile et bien lue (brut puis corrigé de la FC) ;
- actionnable : « aurait dû » et « prochaine fois » disent quoi faire, avec une cible chiffrée, et visent ce qui était réellement dégradé ; une case « rien à corriger » justifiée est actionnable ;
- ton : un coach qui tutoie, direct, motivant sans flatterie, ni jargon de système ;
- concision : rien de redondant, lisible d'un coup d'œil.

Indique la version préférée (ou "égal") et pourquoi. Dans "overall", décris les défauts et qualités récurrents sans parler de A ni de B : les étiquettes sont tirées séance par séance. Sois exigeant : un 5 est rare. Les étiquettes A et B sont tirées au hasard : ne favorise aucune position.`;

/** Ce que le juge lit d'un débrief : sans le paragraphe détaillé, pour limiter les tokens. */
export function judgedView(output: SessionCoachOutput) {
  return { verdict: output.verdict, constats: output.bullets, a_reproduire: output.keep, aurait_du: output.shouldHave, prochaine_fois: output.nextTime };
}

/** true : la variante est présentée en A. Tirage déterministe par séance et variante. */
export function variantIsA(fixtureId: string, variantName: string): boolean {
  return createHash("sha256").update(`${fixtureId}:${variantName}`).digest()[0] % 2 === 0;
}

export type JudgeCase = { fixtureId: string; label: string; facts: unknown; baseline: SessionCoachOutput; variant: SessionCoachOutput };

export function buildJudgePrompt(cases: JudgeCase[], variantName: string): string {
  const items = cases.map((entry) => {
    const variantFirst = variantIsA(entry.fixtureId, variantName);
    return { fixture: entry.fixtureId, seance: entry.label, faits_du_moteur: entry.facts, A: judgedView(variantFirst ? entry.variant : entry.baseline), B: judgedView(variantFirst ? entry.baseline : entry.variant) };
  });
  return `Évalue ces débriefs.\n\n${JSON.stringify(items)}`;
}

export type CriterionScores = Record<Criterion, number>;
export type ResolvedVerdict = { fixture: string; baseline: CriterionScores; variant: CriterionScores; preferred: "en place" | "variante" | "égal"; comment: string; /** Étiquette donnée à la variante dans ce cas (le commentaire du juge parle en A/B). */ variantLabel: "A" | "B" };

/** Remet les notes A/B dans l'ordre « en place » / « variante ». */
export function resolveJudgement(output: JudgeOutput, variantName: string): ResolvedVerdict[] {
  return output.verdicts.map((verdict) => {
    const variantFirst = variantIsA(verdict.fixture, variantName);
    const preferred = verdict.preferred === "égal" ? "égal" : (verdict.preferred === "A") === variantFirst ? "variante" : "en place";
    return { fixture: verdict.fixture, baseline: variantFirst ? verdict.B : verdict.A, variant: variantFirst ? verdict.A : verdict.B, preferred, comment: verdict.comment, variantLabel: variantFirst ? "A" : "B" };
  });
}
