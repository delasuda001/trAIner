import { z } from "zod";
import { INTERVAL_INTENSITY_LABELS, paceSeconds, SESSION_KIND_LABELS, sessionTitle, type ActivityMetrics, type DynamicsValues } from "@/lib/engine/activity-metrics";
import type { ComparisonDeltas } from "@/lib/engine/comparable";
import { readDynamics } from "@/lib/engine/dynamics-reading";
import { VERDICT_LABELS, type SessionVerdict } from "@/lib/engine/verdict";
import { ZONE_LABELS, zoneOf, zoneRange } from "@/lib/engine/zones";
import { formatClock, formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import type { HeartRateZones } from "@/lib/source/types";

export const SESSION_PROMPT_VERSION = "session-v5";

export const sessionCoachSchema = z.object({
  verdict: z.string().min(10).max(260),
  bullets: z.array(z.string().min(10).max(320)).min(3).max(4),
  wentWell: z.string().min(10).max(360),
  toWork: z.string().min(10).max(360),
  detail: z.string().min(40).max(1800),
});

export type SessionCoachOutput = z.infer<typeof sessionCoachSchema>;

export const sessionCoachJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "bullets", "wentWell", "toWork", "detail"],
  properties: {
    verdict: { type: "string", description: "Une phrase de verdict, 180 caractères max." },
    bullets: { type: "array", minItems: 3, maxItems: 4, items: { type: "string" }, description: "3 ou 4 constats chiffrés, 200 caractères au plus chacun." },
    wentWell: { type: "string", description: "Une chose bien faite, chiffrée, 250 caractères au plus." },
    toWork: { type: "string", description: "Une chose à travailler, concrète et chiffrée, 250 caractères au plus." },
    detail: { type: "string", description: "Un paragraphe d'analyse plus détaillée, 1200 caractères max." },
  },
} as const;

export const SESSION_SYSTEM_PROMPT = `Tu es le coach de course à pied de Bastien, coureur expérimenté (1 à 2 sorties par semaine). Tu analyses UNE séance à partir d'une charge utile JSON calculée par un moteur déterministe.

Règles absolues :
- Français, tutoiement, ton de coach : direct, précis, sans remplissage ni formule de politesse.
- Chaque chiffre que tu écris doit apparaître tel quel dans la charge utile (allures m:ss, FC en bpm, pourcentages, distances, durées). N'en calcule aucun, n'en invente aucun.
- Chaque FC de la charge utile porte sa zone entre parenthèses : quand tu cites une zone, reprends exactement celle-là.
- Le niveau du verdict est fixé par "verdict_calcule.niveau" et son signal principal est l'efficacité à FC égale face aux séances comparables : ta phrase de verdict nomme cet écart et va dans le même sens, sans recopier le libellé du niveau (il est déjà affiché en badge).
- Cite le nombre de séances comparables et leur ancienneté. Si "comparaison_fragile" est vrai, dis-le.
- Le point à travailler vise la CAUSE probable de l'écart, en t'appuyant sur "contexte_de_la_seance" (charge des 7 jours, séances de qualité rapprochées, jours depuis la course précédente, récupération du jour) et sur l'objectif. Pas seulement le symptôme. Si rien dans le contexte n'explique l'écart, dis-le.
- Pas de conseil générique (« hydrate-toi », « écoute ton corps »). Aucune interprétation médicale, de blessure ou de fatigue globale ; la récupération se décrit par ses chiffres.
- Pas de remarque sur la température.
- Dynamique de course (cadence, temps de contact au sol, oscillation, longueur de pas) : compare-la uniquement à ses propres valeurs (début/fin de séance, séances comparables), jamais à une norme. N'en parle que si un écart ressort.
- Un même indicateur reçoit UNE seule lecture : reprends la qualification de "verdict_calcule" (positif, à surveiller, neutre ou « dans ta norme »). Ne présente jamais un même fait comme point fort et comme point à travailler, ni avec deux qualificatifs différents.
- Quand tu compares l'allure aux séances comparables, donne d'abord l'écart brut puis l'écart une fois corrigé de la FC, avec les deux chiffres de la charge utile.
- Le ressenti de l'athlète ("ressenti"), s'il est fourni, est un fait à prendre en compte : relie-le aux chiffres.

Format : "verdict" (une phrase), "bullets" (3 ou 4 constats courts et chiffrés), "wentWell", "toWork", "detail" (un paragraphe qui relie les constats, le contexte et l'objectif).`;

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
};

type Comparable = { localDate: string; title: string; ageDays: number; movingTimeS: number | null; distanceM: number | null; mainSpeedMps: number | null; mainHeartRateBpm: number | null; workSpeedMps: number | null; workHeartRateBpm: number | null };

export type SessionContextInput = {
  loadRatio: number | null;
  acute7d: number;
  chronicWeekly28d: number;
  qualityBefore14d: Array<{ localDate: string; title: string; daysBefore: number }>;
  daysSincePreviousRun: number | null;
  recovery: {
    hrv: { latest: number | null; baselineLow: number | null; baselineHigh: number | null };
    restingHr: { latest: number | null; delta: number | null };
    sleep: { latest: number | null; delta: number | null };
    flags: string[];
  };
};

function dynamicsLine(values: DynamicsValues): string {
  const parts: string[] = [];
  if (values.cadenceSpm != null) parts.push(`cadence ${values.cadenceSpm} pas/min`);
  if (values.groundContactMs != null) parts.push(`contact au sol ${values.groundContactMs} ms`);
  if (values.verticalOscillationMm != null) parts.push(`oscillation ${formatNumber(values.verticalOscillationMm / 10, 1)} cm`);
  if (values.verticalRatioPct != null) parts.push(`ratio vertical ${formatNumber(values.verticalRatioPct, 1)} %`);
  if (values.stepLengthM != null) parts.push(`pas de ${formatNumber(values.stepLengthM, 2)} m`);
  return parts.join(", ") || "—";
}

function describeDynamics(metrics: ActivityMetrics, deltas: ComparisonDeltas) {
  const dynamics = metrics.dynamics;
  if (!dynamics) return null;
  return {
    base: dynamics.basis === "reps" ? "répétitions" : "séance courue hors échauffement",
    moyennes: dynamicsLine(dynamics),
    [dynamics.basis === "reps" ? "premiere_repetition" : "premiere_moitie"]: dynamicsLine(dynamics.early),
    [dynamics.basis === "reps" ? "derniere_repetition" : "deuxieme_moitie"]: dynamicsLine(dynamics.late),
    lecture: readDynamics(metrics, deltas),
    comparables: deltas.dynamicsReference ? `${dynamicsLine(deltas.dynamicsReference.values)} (${deltas.dynamicsReference.count} séance${deltas.dynamicsReference.count > 1 ? "s" : ""})` : "—",
  };
}

function pct(value: number | null | undefined, digits = 1): string {
  return value == null ? "—" : `${formatNumber(value, digits)} %`;
}

function ageText(days: number): string {
  if (days < 14) return `il y a ${days} jours`;
  if (days < 60) return `il y a ${Math.round(days / 7)} semaines`;
  return `il y a ${Math.round(days / 30)} mois`;
}

const FLAG_TEXT: Record<string, string> = { hrv_low: "VFC sous la plage habituelle", resting_hr_high: "FC de repos au-dessus de la base", sleep_short: "nuit courte" };

export function buildSessionPayload(input: {
  session: Session;
  metrics: ActivityMetrics;
  deltas: ComparisonDeltas;
  verdict: SessionVerdict;
  comparables: Comparable[];
  zones: HeartRateZones;
  lactateThresholdSpeedMps: number | null;
  context: SessionContextInput | null;
  goal: Record<string, string>;
  feeling?: { perceivedEffort: number | null; note: string } | null;
}) {
  const { session, metrics, deltas, verdict, zones, context } = input;
  // Chaque FC porte sa zone : Claude ne peut plus se tromper de zone.
  const bpm = (value: number | null | undefined): string => {
    if (value == null) return "—";
    const zone = zoneOf(value, zones);
    return `${Math.round(value)} bpm (${zone === 0 ? "sous Z1" : `Z${zone}`})`;
  };
  const work = metrics.work;
  const gain = deltas.paceAtEqualHrGainSPerKm;
  const hrDelta = deltas.hrAtEqualPaceDeltaBpm;
  const workGain = deltas.work?.paceAtEqualHrGainSPerKm ?? null;
  return {
    seance: {
      date: formatDate(session.localDate, "long"),
      type: sessionTitle(metrics),
      intensite: work ? (INTERVAL_INTENSITY_LABELS[metrics.kind] ?? "—") : SESSION_KIND_LABELS[metrics.kind],
      terrain: session.sport === "trail_running" ? "trail" : session.sport === "treadmill_running" ? "tapis" : "route",
      distance: formatDistance(session.distanceM, 2),
      duree: formatClock(session.movingTimeS),
      allure_moyenne: formatPace(session.averageSpeedMps),
      fc_moyenne: bpm(session.averageHeartRateBpm),
      allure_hors_echauffement: formatPace(metrics.mainSpeedMps),
      fc_hors_echauffement: bpm(metrics.mainHeartRateBpm),
      denivele_positif: session.elevationGainM != null ? `${Math.round(session.elevationGainM)} m` : "—",
      cadence: session.averageCadenceSpm ? `${Math.round(session.averageCadenceSpm)} pas/min` : "—",
    },
    structure: work
      ? {
          repetitions: `${work.reps} répétitions de ${formatDuration(work.averageDurationS)}${work.averageDistanceM ? ` (${formatDistance(work.averageDistanceM, 2)})` : ""}`,
          allure_repetitions: formatPace(work.averageSpeedMps),
          fc_moyenne_repetitions: bpm(work.averageHeartRateBpm),
          fc_max_moyenne_repetitions: bpm(work.peakHeartRateBpm),
          ecart_entre_rep_la_plus_rapide_et_la_plus_lente: work.paceSpreadSPerKm == null ? "—" : `${work.paceSpreadSPerKm} s/km`,
          evolution_premieres_vs_dernieres: work.fadeSPerKm == null ? "—" : work.fadeSPerKm === 0 ? "même allure" : `dernières ${Math.abs(work.fadeSPerKm)} s/km plus ${work.fadeSPerKm > 0 ? "lentes" : "rapides"}`,
          recuperation_moyenne: work.averageRecoveryS ? formatDuration(work.averageRecoveryS) : "—",
          detail_repetitions: work.repsDetail.slice(0, 8).map((rep, index) => `#${index + 1} ${formatClock(rep.durationS)}${rep.distanceM ? ` ${formatDistance(rep.distanceM, 2)}` : ""} à ${formatPace(rep.speedMps)}, FC ${bpm(rep.heartRateBpm)}, max ${bpm(rep.maxHeartRateBpm)}${rep.recoveryAfterS ? `, récup ${formatClock(rep.recoveryAfterS)}` : ""}`),
        }
      : metrics.halves
        ? {
            premiere_moitie: `${formatPace(metrics.halves.first.speedMps)} à ${bpm(metrics.halves.first.heartRateBpm)}`,
            deuxieme_moitie: `${formatPace(metrics.halves.second.speedMps)} à ${bpm(metrics.halves.second.heartRateBpm)}`,
            deuxieme_moitie_vs_premiere: metrics.halves.fadeSPerKm === 0 ? "même allure" : `${Math.abs(metrics.halves.fadeSPerKm)} s/km plus ${metrics.halves.fadeSPerKm > 0 ? "lente" : "rapide"}`,
            derive_cardiaque: pct(metrics.halves.driftPct),
            ...(metrics.blocks ? { blocs_5_km: metrics.blocks.map((block) => `${formatNumber(block.fromKm, 1)}–${formatNumber(block.toKm, 1)} km : ${formatPace(block.speedMps)}, ${bpm(block.heartRateBpm)}`) } : {}),
          }
        : { note: "Séance trop courte pour comparer deux moitiés." },
    dynamique_de_course: describeDynamics(metrics, deltas),
    temps_en_zones: metrics.zoneShares ? Object.fromEntries(metrics.zoneShares.map((share, index) => [ZONE_LABELS[(index + 1) as 1 | 2 | 3 | 4 | 5], `${Math.round(share * 100)} %`])) : null,
    comparaison: {
      nombre_seances_comparables: deltas.count,
      comparaison_fragile: verdict.fewComparables,
      criteres: "même famille de séance, même format de répétitions, durée et dénivelé proches, moins d'un an",
      seances: input.comparables.map((run) => ({
        date: formatDate(run.localDate, "medium"),
        anciennete: ageText(run.ageDays),
        type: run.title,
        duree: formatClock(run.movingTimeS),
        distance: formatDistance(run.distanceM, 2),
        ...(work ? { allure_repetitions: formatPace(run.workSpeedMps), fc_repetitions: bpm(run.workHeartRateBpm) } : { allure: formatPace(run.mainSpeedMps), fc: bpm(run.mainHeartRateBpm) }),
      })),
      ...(work
        ? {
            repetitions_comparables: deltas.work?.reference ? { allure: formatPace(deltas.work.reference.speedMps), fc: bpm(deltas.work.reference.heartRateBpm), ecart_entre_rep_la_plus_rapide_et_la_plus_lente: deltas.work.reference.paceSpreadSPerKm == null ? "—" : `${deltas.work.reference.paceSpreadSPerKm} s/km` } : null,
            repetitions_ecart_brut: deltas.work?.reference?.speedMps && work ? (() => { const raw = paceSeconds(work.averageSpeedMps) - paceSeconds(deltas.work.reference.speedMps); return raw === 0 ? "même allure" : `${Math.abs(raw)} s/km plus ${raw > 0 ? "lentes" : "rapides"}`; })() : "—",
            repetitions_allure_a_fc_egale: workGain == null ? "—" : Math.abs(workGain) < 2 ? "identique" : `${formatNumber(Math.abs(workGain))} s/km plus ${workGain > 0 ? "rapide" : "lent"}`,
          }
        : {
            allure_moyenne_comparables: formatPace(deltas.reference.speedMps),
            fc_moyenne_comparables: bpm(deltas.reference.heartRateBpm),
            allure_a_fc_egale: gain == null ? "—" : Math.abs(gain) < 2 ? "identique" : `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"}`,
            fc_a_allure_egale: hrDelta == null ? "—" : hrDelta === 0 ? "identique" : `${formatNumber(Math.abs(hrDelta))} bpm plus ${hrDelta > 0 ? "haute" : "basse"}`,
            derive_cardiaque_comparables: pct(deltas.drift.reference),
            deuxieme_moitie_comparables: deltas.fadeSPerKm.reference == null ? "—" : `${Math.abs(deltas.fadeSPerKm.reference)} s/km plus ${deltas.fadeSPerKm.reference > 0 ? "lente" : "rapide"}`,
          }),
    },
    contexte_de_la_seance: context
      ? {
          charge_garmin_7_jours_au_jour_de_la_seance: `${context.acute7d}, soit ${context.loadRatio == null ? "—" : `${formatNumber(context.loadRatio, 1)} fois`} la moyenne hebdo de 4 semaines (${context.chronicWeekly28d})`,
          jours_depuis_course_precedente: context.daysSincePreviousRun == null ? "—" : String(context.daysSincePreviousRun),
          seances_de_qualite_14_jours_avant: context.qualityBefore14d.length ? context.qualityBefore14d.map((entry) => `${entry.title}, ${entry.daysBefore} jours avant`) : "aucune",
          recuperation_du_jour: {
            vfc: context.recovery.hrv.latest != null ? `${Math.round(context.recovery.hrv.latest)} ms (plage habituelle ${context.recovery.hrv.baselineLow ?? "—"}–${context.recovery.hrv.baselineHigh ?? "—"} ms)` : "—",
            fc_repos: context.recovery.restingHr.latest != null ? `${Math.round(context.recovery.restingHr.latest)} bpm au repos (${context.recovery.restingHr.delta == null ? "base inconnue" : `${context.recovery.restingHr.delta >= 0 ? "+" : "−"}${Math.abs(context.recovery.restingHr.delta)} vs base`})` : "—",
            sommeil: context.recovery.sleep.latest != null ? formatDuration(context.recovery.sleep.latest) : "—",
            signaux_degrades: context.recovery.flags.length ? context.recovery.flags.map((flag) => FLAG_TEXT[flag] ?? flag) : "aucun",
          },
        }
      : null,
    objectif: input.goal,
    ressenti: input.feeling ? { effort_percu: input.feeling.perceivedEffort != null ? `${input.feeling.perceivedEffort}/10` : "—", note: input.feeling.note || "—" } : "non renseigné",
    verdict_calcule: {
      niveau: VERDICT_LABELS[verdict.level],
      signaux: verdict.signals.map((signal) => `${signal.primary ? "PRINCIPAL " : ""}${signal.tone === "good" ? "positif" : signal.tone === "watch" ? "à surveiller" : "neutre"} : ${signal.label}`),
    },
    reperes_athlete: {
      zones_fc: Object.fromEntries(([1, 2, 3, 4, 5] as const).map((zone) => [ZONE_LABELS[zone], `${zoneRange(zone, zones)[0]}–${zoneRange(zone, zones)[1]} bpm`])),
      seuil_montre: input.lactateThresholdSpeedMps && zones.lactateThresholdHeartRateBpm ? `${formatPace(input.lactateThresholdSpeedMps)} à ${bpm(zones.lactateThresholdHeartRateBpm)}` : "—",
    },
  };
}

export type SessionPayload = ReturnType<typeof buildSessionPayload>;

export function buildSessionPrompt(payload: SessionPayload): string {
  return `Analyse cette séance.\n\n${JSON.stringify(payload)}`;
}
