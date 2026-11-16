import { z } from "zod";
import type { buildSessionPayload } from "@/lib/coach/session-coach";

/**
 * Banc de tests du coach : un jeu figé de séances représentatives (entrées du
 * moteur, jamais de flux bruts ni de GPS), rejoué contre la version en place
 * des prompts et contre des variantes. Le banc propose, il n'applique rien.
 */

export type SessionPayloadInput = Parameters<typeof buildSessionPayload>[0];

export const BENCH_CATEGORIES = ["endurance", "sortie_longue", "fractionne_court", "fractionne_long", "seuil", "seance_ratee", "mal_reconnue"] as const;
export type BenchCategory = (typeof BENCH_CATEGORIES)[number];

export type BenchFixture = {
  id: string;
  category: BenchCategory;
  /** Libellé lisible (« Fractionné long 3 × 2 km, 13 nov. »). */
  label: string;
  frozenAt: string;
  input: SessionPayloadInput;
};

/**
 * Variante testée : remplace le prompt système et/ou retire des blocs de la
 * charge utile (pour mesurer ce qu'un contexte allégé coûte en qualité).
 */
export const benchVariantSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(5),
  /** Prompt système complet de remplacement (sinon celui en place). */
  systemPrompt: z.string().min(50).optional(),
  /** Chemins de clés retirés de la charge utile, ex. « dynamique_de_course » ou « comparaison.seances ». */
  dropKeys: z.array(z.string()).default([]),
  /** Origine : écrit à la main, ou proposé par un bilan hebdomadaire. */
  source: z.string().default("manuel"),
});

export type BenchVariant = z.infer<typeof benchVariantSchema>;
