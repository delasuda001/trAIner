import { z } from "zod";
import { SESSION_KIND_LABELS, type ActivityMetrics, type SessionKind } from "@/lib/engine/activity-metrics";
import type { ComparisonDeltas } from "@/lib/engine/comparable";
import { VERDICT_LABELS, type SessionVerdict } from "@/lib/engine/verdict";
import { ZONE_LABELS, zoneRange } from "@/lib/engine/zones";
import { formatClock, formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import type { HeartRateZones } from "@/lib/source/types";

export const SESSION_PROMPT_VERSION = "session-v1";

export const sessionCoachSchema = z.object({
  verdict: z.string().min(10).max(180),
  bullets: z.array(z.string().min(10).max(260)).min(3).max(4),
  wentWell: z.string().min(10).max(260),
  toWork: z.string().min(10).max(260),
  detail: z.string().min(40).max(1200),
});

export type SessionCoachOutput = z.infer<typeof sessionCoachSchema>;

export const sessionCoachJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "bullets", "wentWell", "toWork", "detail"],
  properties: {
    verdict: { type: "string", description: "Une phrase de verdict, 180 caractères max." },
    bullets: { type: "array", minItems: 3, maxItems: 4, items: { type: "string" }, description: "3 ou 4 constats chiffrés, un par ligne." },
    wentWell: { type: "string", description: "Une chose bien faite, chiffrée." },
    toWork: { type: "string", description: "Une chose à travailler, concrète et chiffrée." },
    detail: { type: "string", description: "Un paragraphe d'analyse plus détaillée, 1200 caractères max." },
  },
} as const;

export const SESSION_SYSTEM_PROMPT = `Tu es le coach de course à pied de Bastien, coureur expérimenté. Tu analyses UNE séance à partir d'une charge utile JSON calculée par un moteur déterministe.

Règles absolues :
- Français, tutoiement, ton de coach : direct, précis, sans remplissage ni formule de politesse.
- Chaque chiffre que tu écris doit apparaître tel quel dans la charge utile (allures au format m:ss, FC en bpm, pourcentages, distances, durées). N'en calcule aucun, n'en arrondis aucun autrement, n'en invente aucun.
- Le niveau du verdict est fixé par "verdict_calcule.niveau" : ta phrase de verdict doit aller dans le même sens.
- Compare aux séances comparables quand elles existent, en citant leur nombre. S'il n'y en a pas, dis-le sans broder.
- Pas de conseil générique (« hydrate-toi », « écoute ton corps », « pense à t'étirer »). Le point à travailler doit être une action concrète liée à un chiffre de la séance.
- Aucune interprétation médicale, de blessure ou de fatigue globale.

Format : "verdict" (une phrase), "bullets" (3 ou 4 constats courts et chiffrés), "wentWell", "toWork", "detail" (un paragraphe qui relie les constats et explique le pourquoi).`;

type Session = {
  name: string;
  localDate: string;
  sport: string;
  distanceM: number | null;
  movingTimeS: number | null;
  averageSpeedMps: number | null;
  averageHeartRateBpm: number | null;
  elevationGainM: number | null;
  averageCadenceSpm: number | null;
  averageTemperatureC: number | null;
};

type Comparable = { localDate: string; kind: string; movingTimeS: number | null; distanceM: number | null; mainSpeedMps: number | null; mainHeartRateBpm: number | null };

function bpm(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value)} bpm`;
}

function pct(value: number | null | undefined, digits = 1): string {
  return value == null ? "—" : `${formatNumber(value, digits)} %`;
}

export function buildSessionPayload(input: {
  session: Session;
  metrics: ActivityMetrics;
  deltas: ComparisonDeltas;
  verdict: SessionVerdict;
  comparables: Comparable[];
  zones: HeartRateZones;
  lactateThresholdSpeedMps: number | null;
}) {
  const { session, metrics, deltas, verdict, zones } = input;
  const work = metrics.work;
  const gain = deltas.paceAtEqualHrGainSPerKm;
  const hrDelta = deltas.hrAtEqualPaceDeltaBpm;
  return {
    seance: {
      date: formatDate(session.localDate, "long"),
      type: SESSION_KIND_LABELS[metrics.kind],
      terrain: session.sport === "trail_running" ? "trail" : session.sport === "treadmill_running" ? "tapis" : "route",
      distance: formatDistance(session.distanceM, 2),
      duree: formatClock(session.movingTimeS),
      allure_moyenne: formatPace(session.averageSpeedMps),
      fc_moyenne: bpm(session.averageHeartRateBpm),
      allure_hors_echauffement: formatPace(metrics.mainSpeedMps),
      fc_hors_echauffement: bpm(metrics.mainHeartRateBpm),
      denivele_positif: session.elevationGainM != null ? `${Math.round(session.elevationGainM)} m` : "—",
      cadence: session.averageCadenceSpm ? `${Math.round(session.averageCadenceSpm)} pas/min` : "—",
      temperature_montre: session.averageTemperatureC != null ? `${Math.round(session.averageTemperatureC)} °C` : "—",
    },
    structure: work
      ? {
          repetitions: `${work.reps} répétitions de ${formatDuration(work.averageDurationS)}${work.averageDistanceM ? ` (${formatDistance(work.averageDistanceM, 2)})` : ""}`,
          allure_repetitions: formatPace(work.averageSpeedMps),
          fc_moyenne_repetitions: bpm(work.averageHeartRateBpm),
          fc_max_moyenne_repetitions: bpm(work.peakHeartRateBpm),
          ecart_allure_entre_repetitions: pct(work.speedCvPct),
          evolution_premieres_vs_dernieres: work.fadePct == null ? "—" : work.fadePct > 0 ? `dernières ${pct(work.fadePct)} plus lentes` : `dernières ${pct(-work.fadePct)} plus rapides`,
          recuperation_moyenne: work.averageRecoveryS ? formatDuration(work.averageRecoveryS) : "—",
          detail_repetitions: work.repsDetail.slice(0, 12).map((rep, index) => `#${index + 1} ${formatClock(rep.durationS)}${rep.distanceM ? ` ${formatDistance(rep.distanceM, 2)}` : ""} à ${formatPace(rep.speedMps)}, FC ${bpm(rep.heartRateBpm)} (max ${bpm(rep.maxHeartRateBpm)})${rep.recoveryAfterS ? `, récup ${formatClock(rep.recoveryAfterS)}` : ""}`),
        }
      : metrics.halves
        ? {
            premiere_moitie: `${formatPace(metrics.halves.first.speedMps)} à ${bpm(metrics.halves.first.heartRateBpm)}`,
            deuxieme_moitie: `${formatPace(metrics.halves.second.speedMps)} à ${bpm(metrics.halves.second.heartRateBpm)}`,
            ralentissement_deuxieme_moitie: pct(metrics.halves.fadePct),
            derive_cardiaque: pct(metrics.halves.driftPct),
            ...(metrics.blocks ? { blocs_5_km: metrics.blocks.map((block) => `${formatNumber(block.fromKm, 1)}–${formatNumber(block.toKm, 1)} km : ${formatPace(block.speedMps)}, ${bpm(block.heartRateBpm)}`) } : {}),
          }
        : { note: "Séance trop courte pour comparer deux moitiés." },
    temps_en_zones: metrics.zoneShares ? Object.fromEntries(metrics.zoneShares.map((share, index) => [ZONE_LABELS[(index + 1) as 1 | 2 | 3 | 4 | 5], `${Math.round(share * 100)} %`])) : null,
    comparaison: {
      nombre_seances_comparables: deltas.count,
      seances: input.comparables.map((run) => ({
        date: formatDate(run.localDate, "medium"),
        type: SESSION_KIND_LABELS[run.kind as SessionKind] ?? run.kind,
        duree: formatClock(run.movingTimeS),
        distance: formatDistance(run.distanceM, 2),
        allure: formatPace(run.mainSpeedMps),
        fc: bpm(run.mainHeartRateBpm),
      })),
      allure_moyenne_comparables: work ? "non pertinent (fractionné : voir repetitions_comparables)" : formatPace(deltas.reference.speedMps),
      fc_moyenne_comparables: work ? "non pertinent" : bpm(deltas.reference.heartRateBpm),
      allure_a_fc_egale: gain == null ? "—" : gain === 0 ? "identique" : `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"}`,
      fc_a_allure_egale: hrDelta == null ? "—" : hrDelta === 0 ? "identique" : `${formatNumber(Math.abs(hrDelta))} bpm plus ${hrDelta > 0 ? "haute" : "basse"}`,
      derive_cardiaque_comparables: pct(deltas.drift.reference),
      ralentissement_comparables: pct(deltas.fade.reference),
      repetitions_comparables: deltas.work?.reference
        ? { allure: formatPace(deltas.work.reference.speedMps), fc: bpm(deltas.work.reference.heartRateBpm), ecart_entre_repetitions: pct(deltas.work.reference.speedCvPct) }
        : null,
    },
    verdict_calcule: {
      niveau: VERDICT_LABELS[verdict.level],
      signaux: verdict.signals.map((signal) => `${signal.tone === "good" ? "positif" : signal.tone === "watch" ? "à surveiller" : "neutre"} : ${signal.label}`),
    },
    reperes_athlete: {
      zones_fc: Object.fromEntries(([1, 2, 3, 4, 5] as const).map((zone) => [ZONE_LABELS[zone], `${zoneRange(zone, zones)[0]}–${zoneRange(zone, zones)[1]} bpm`])),
      seuil_montre: input.lactateThresholdSpeedMps && zones.lactateThresholdHeartRateBpm ? `${formatPace(input.lactateThresholdSpeedMps)} à ${bpm(zones.lactateThresholdHeartRateBpm)}` : "—",
      rythme_habituel: "1 à 2 courses par semaine",
    },
  };
}

export type SessionPayload = ReturnType<typeof buildSessionPayload>;

export function buildSessionPrompt(payload: SessionPayload): string {
  return `Analyse cette séance.\n\n${JSON.stringify(payload, null, 2)}`;
}
