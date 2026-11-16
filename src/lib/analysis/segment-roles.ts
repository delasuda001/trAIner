import { classifySegmentInZone, type TrainingZone } from "./zones";
import type { ActivitySegment } from "./types";

export type SegmentRole = "warmup" | "work" | "recovery" | "cooldown" | "unknown";

export type RoledSegment = ActivitySegment & {
  role: SegmentRole;
  zone: TrainingZone | null;
  percentOfThreshold: number | null;
};

export type SegmentRoleClassification = { segments: RoledSegment[]; confidence: "high" | "low" };

const WORK_ZONES: readonly TrainingZone[] = ["tempo", "threshold", "vo2max", "anaerobic"];
const EASY_ZONES: readonly TrainingZone[] = ["recovery", "easy"];

/** Un préfixe/suffixe easy plus long que cela n'est plus un échauffement/retour au calme. */
const EDGE_DURATION_FRACTION = 0.2;

/** Au-delà de cette proportion de segments non attribuables à un rôle, la confiance retombe à "low". */
const UNKNOWN_RATIO_THRESHOLD = 0.3;

function isWork(segment: Pick<RoledSegment, "zone">): boolean {
  return segment.zone != null && WORK_ZONES.includes(segment.zone);
}

function isEasy(segment: Pick<RoledSegment, "zone">): boolean {
  return segment.zone != null && EASY_ZONES.includes(segment.zone);
}

/**
 * Attribue un rôle (warmup/work/recovery/cooldown/unknown) à chaque segment
 * d'une séance déjà découpée par `segmentActivity`. Les métriques de
 * régularité, de volume de travail et de comparabilité (session-signature,
 * regularity) doivent raisonner uniquement sur les segments `work`/`recovery`
 * produits ici, jamais sur la liste brute de segments.
 *
 * Règles (cf. docs/plan de consolidation, §3.1) :
 * - `work` = zone tempo/seuil/VO2max/anaérobie (`classifySegmentInZone`).
 * - `warmup` = préfixe contigu en zone recovery/easy avant le 1er segment
 *   `work`, borné à 20% de la durée totale de la séance.
 * - `cooldown` = suffixe symétrique après le dernier segment `work`.
 * - `recovery` = segment recovery/easy strictement entre deux segments
 *   `work` (interstitiel) — jamais en tête ni en fin.
 * - `unknown` = zone indéterminée (vitesse absente), ou séance sans aucun
 *   segment `work` (traitée en mode continu par l'appelant, cf. context.ts).
 *
 * La confiance globale retombe à `"low"` s'il y a moins de 2 segments
 * exploitables (zone connue) ou si plus de 30% des segments restent
 * `unknown` — dans ce cas, la signature structurée de l'activité doit être
 * `"unavailable"` : aucun découpage travail/récupération approximatif n'est
 * fabriqué.
 */
export function classifySegmentRoles(segments: ActivitySegment[], thresholdSpeedMps: number | null): SegmentRoleClassification {
  const classified: RoledSegment[] = segments.map((segment) => {
    const { zone, percentOfThreshold } = classifySegmentInZone(segment.averageSpeedMps, thresholdSpeedMps);
    return { ...segment, zone, percentOfThreshold, role: "unknown" };
  });

  const totalDurationS = classified.reduce((sum, segment) => sum + segment.durationS, 0);
  const edgeBudgetS = totalDurationS * EDGE_DURATION_FRACTION;

  const firstWorkIndex = classified.findIndex(isWork);
  if (firstWorkIndex === -1) {
    return finalize(classified);
  }
  let lastWorkIndex = -1;
  for (let index = classified.length - 1; index >= 0; index -= 1) {
    if (isWork(classified[index])) {
      lastWorkIndex = index;
      break;
    }
  }

  let warmupDurationS = 0;
  for (let index = 0; index < firstWorkIndex; index += 1) {
    const segment = classified[index];
    if (!isEasy(segment) || warmupDurationS + segment.durationS > edgeBudgetS) break;
    segment.role = "warmup";
    warmupDurationS += segment.durationS;
  }

  let cooldownDurationS = 0;
  for (let index = classified.length - 1; index > lastWorkIndex; index -= 1) {
    const segment = classified[index];
    if (!isEasy(segment) || cooldownDurationS + segment.durationS > edgeBudgetS) break;
    segment.role = "cooldown";
    cooldownDurationS += segment.durationS;
  }

  for (let index = firstWorkIndex; index <= lastWorkIndex; index += 1) {
    const segment = classified[index];
    if (isWork(segment)) segment.role = "work";
    else if (isEasy(segment)) segment.role = "recovery";
  }

  return finalize(classified);
}

function finalize(classified: RoledSegment[]): SegmentRoleClassification {
  const exploitableCount = classified.filter((segment) => segment.zone != null).length;
  const unknownCount = classified.filter((segment) => segment.role === "unknown").length;
  const unknownRatio = classified.length > 0 ? unknownCount / classified.length : 1;
  const confidence: "high" | "low" = exploitableCount < 2 || unknownRatio > UNKNOWN_RATIO_THRESHOLD ? "low" : "high";
  return { segments: classified, confidence };
}
