import { z } from "zod";
import { INTERVAL_INTENSITY_LABELS, paceSeconds, SESSION_KIND_LABELS, sessionTitle, type ActivityMetrics, type DynamicsValues } from "@/lib/engine/activity-metrics";
import type { ComparisonDeltas } from "@/lib/engine/comparable";
import { readDynamics } from "@/lib/engine/dynamics-reading";
import { paceReferenceSentence, SHORT_REP_S, type Prescription, type PrescriptionTarget } from "@/lib/engine/prescription";
import { VERDICT_LABELS, type SessionVerdict } from "@/lib/engine/verdict";
import { thresholdAtZ4Z5Boundary, ZONE_LABELS, zoneOf, zoneRange } from "@/lib/engine/zones";
import { formatClock, formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import type { HeartRateZones } from "@/lib/source/types";

export const SESSION_PROMPT_VERSION = "session-v15";

export const sessionCoachSchema = z.object({
  verdict: z.string().min(10).max(260),
  bullets: z.array(z.string().min(10).max(320)).min(3).max(4),
  keep: z.string().min(10).max(260),
  shouldHave: z.string().min(10).max(280),
  nextTime: z.string().min(10).max(280),
  /** Depuis session-v13 : ce que la séance change pour l'objectif (absent des analyses plus anciennes). */
  goalLink: z.string().max(280).optional(),
  detail: z.string().min(20).max(1800),
});

export type SessionCoachOutput = z.infer<typeof sessionCoachSchema>;

/** Analyses antérieures à session-v7 (« Bien fait » / « À travailler ») : relues sans planter l'affichage. */
const legacySessionSchema = z.object({ verdict: z.string(), bullets: z.array(z.string()), wentWell: z.string(), toWork: z.string(), detail: z.string() });

export function normalizeSessionOutput(value: unknown): SessionCoachOutput | null {
  const current = sessionCoachSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = legacySessionSchema.safeParse(value);
  if (!legacy.success) return null;
  return { verdict: legacy.data.verdict, bullets: legacy.data.bullets, keep: legacy.data.wentWell, shouldHave: legacy.data.toWork, nextTime: "", detail: legacy.data.detail };
}

export const sessionCoachJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "bullets", "keep", "shouldHave", "nextTime", "goalLink", "detail"],
  properties: {
    verdict: { type: "string", description: "Une phrase de verdict, 180 caractères max." },
    bullets: { type: "array", minItems: 3, maxItems: 4, items: { type: "string" }, description: "3 ou 4 constats chiffrés (dont la cause probable de l'écart), 200 caractères au plus chacun." },
    keep: { type: "string", description: "À reproduire : une chose réussie, avec le chiffre à garder. Une phrase, 160 caractères au plus." },
    shouldHave: { type: "string", description: "Comment elle aurait dû être menée : la consigne la plus utile de consignes_moteur.aurait_du, cible chiffrée en tête. Une ou deux phrases, 200 caractères au plus." },
    nextTime: { type: "string", description: "La prochaine séance de ce type : consignes_moteur.prochaine_fois, avec le format et la cible chiffrée. Une ou deux phrases, 200 caractères au plus." },
    goalLink: { type: "string", description: "Ce que cette séance change pour l'objectif : une phrase, 200 caractères au plus, qui reprend \"ecart_objectif\". Chaîne vide s'il n'y a pas d'objectif chiffré." },
    detail: { type: "string", description: "Deux ou trois phrases, 450 caractères au plus, avec seulement ce qui n'est ni dans le verdict ni dans les puces." },
  },
} as const;

export const SESSION_SYSTEM_PROMPT = `Tu es le coach de course de Bastien, coureur expérimenté (1 à 2 sorties/semaine). Tu analyses UNE séance à partir de son résumé chiffré.

Règles :
- Français, tutoiement, direct et précis, sans remplissage. Ne parle jamais de « moteur », de « charge utile », de « JSON » ni de « données fournies » : tu parles de sa séance.
- Chaque chiffre écrit figure tel quel dans le résumé. Aucun calcul : tout ratio, écart ou multiple cité est repris tel quel, avec la valeur à laquelle il se rapporte (« 326, soit 1,4 fois ta moyenne »). Reprends la zone indiquée entre parenthèses après chaque FC.
- Le verdict suit "verdict_calcule.niveau" et reprend "comparaison.ecart_face_aux_comparables" (écart brut puis corrigé de la FC). Cite le nombre de séances comparables et leur ancienneté ; si "comparaison_fragile" est vrai, dis-le.
- Si "format_reconnu" commence par « non », dis simplement que la séance ne correspond pas au format reconnu, ne force aucun verdict ni comparaison, et limite-toi aux constats sûrs (durée, allure, FC, zones).
- Pas de redite : le verdict donne l'écart principal une fois ; chaque puce apporte un fait nouveau (la première ne répète pas l'écart du verdict).
- Un indicateur = une seule lecture, celle de "verdict_calcule" : jamais le même fait dans "keep" et dans "shouldHave" ; si "aurait_du" corrige un indicateur, "keep" n'en parle pas.
- Cause : seulement un élément de "causes_possibles" (une hausse de charge corroborée passe en premier) ; si la liste dit « aucune », n'avance aucune cause ni explication (pas de « parce que », « à cause de », « départ trop rapide pour tenir »). Une cause retenue doit être cohérente avec "shouldHave". Un écart favorable (séance au-dessus de tes repères) n'a jamais de « cause probable » : une hausse de charge devient au plus une précaution pour les jours suivants.
- Dynamique de course : si "dynamique_de_course" dit que rien ne ressort, n'en parle pas du tout. Sinon, compare-la à ses propres valeurs uniquement, et seulement si un écart ressort. L'allure est le produit de la cadence et de la longueur de pas : un pas plus court à cadence égale EST l'allure plus lente, ce n'est jamais une cause. Un indicateur de foulée n'explique quelque chose que s'il bouge indépendamment de l'allure (contact au sol, oscillation, ratio vertical, dérive entre début et fin).
- Constats et cause probable : dans "bullets" seulement.
- "shouldHave" et "nextTime" sont des consignes, pas des constats : verbe d'action, cible chiffrée en tête (allure, FC, récupération, placement), reprises de "consignes_moteur". N'invente aucune autre cible. Si "consignes_moteur" n'en donne pas, dis simplement qu'il n'y a pas de consigne chiffrée pour ce format.
- "shouldHave" : une consigne principale (la première de "consignes_moteur.aurait_du"), au plus une secondaire très courte. Si "aurait_du" dit qu'il n'y a rien à corriger, écris-le en une phrase, sans inventer de reproche.
- Ne juge pas si l'objectif est atteignable. "goalLink" : en une phrase, ce que la séance apporte ou non au levier principal de "ecart_objectif", avec son action chiffrée s'il n'est pas travaillé ; vide sans "ecart_objectif".
- Répétitions de moins de 60 s : aucune répétition isolée commentée (GPS imprécis), seulement moyenne, FC et tenue.
- Pas de conseil générique, pas de température, aucune interprétation médicale.

Format : "verdict" (une phrase), "bullets" (3 ou 4 constats chiffrés), "keep", "shouldHave", "nextTime", "goalLink" (une ou deux phrases courtes), "detail" (deux ou trois phrases nouvelles, jamais une redite des puces).`;

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

type Comparable = { localDate: string; title: string; ageDays: number; nature?: "format" | "family"; older?: boolean; movingTimeS: number | null; distanceM: number | null; mainSpeedMps: number | null; mainHeartRateBpm: number | null; workSpeedMps: number | null; workHeartRateBpm: number | null };

export type SessionContextInput = {
  loadRatio: number | null;
  /** Charge des 7 jours AVANT la séance (sans elle) : ce qui peut expliquer la séance. */
  loadRatioBefore?: number | null;
  /** Hausse de charge corroborée (récupération, ressenti, charge absolue) ou simple repère. */
  loadAlertBefore?: { ratioHigh: boolean; actionable: boolean; reasons: string[] };
  acute7dBefore?: number;
  /** Charge 7 jours avant la séance, sa référence et leur rapport, calculés ensemble. */
  loadBefore?: { value: number; reference: number; ratio: number | null };
  acute7d: number;
  chronicWeekly28d: number;
  qualityBefore14d: Array<{ localDate: string; title: string; daysBefore: number }>;
  daysSincePreviousRun: number | null;
  /** Écart habituel minimal entre deux séances de qualité (jours) ; 3 par défaut. */
  rhythm?: { qualitySpacingDays: number };
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

/** Lectures de foulée qui apprennent quelque chose : pas « foulée stable », ni le pas plus court qui n'est que l'allure. */
export function notableDynamics(metrics: ActivityMetrics, deltas: ComparisonDeltas): string[] {
  return readDynamics(metrics, deltas).filter((line) => !line.startsWith("Foulée stable") && !line.startsWith("Légère évolution") && !line.includes("à cadence égale"));
}

function describeDynamics(metrics: ActivityMetrics, deltas: ComparisonDeltas) {
  const dynamics = metrics.dynamics;
  if (!dynamics) return null;
  const notable = notableDynamics(metrics, deltas);
  if (!notable.length) return "rien qui ressorte face à tes comparables ni entre début et fin : n'en parle pas";
  return {
    base: dynamics.basis === "reps" ? "répétitions" : "séance courue hors échauffement",
    moyennes: dynamicsLine(dynamics),
    [dynamics.basis === "reps" ? "premiere_repetition" : "premiere_moitie"]: dynamicsLine(dynamics.early),
    [dynamics.basis === "reps" ? "derniere_repetition" : "deuxieme_moitie"]: dynamicsLine(dynamics.late),
    lecture: notable,
    comparables: deltas.dynamicsReference ? `${dynamicsLine(deltas.dynamicsReference.values)} (${deltas.dynamicsReference.count} séance${deltas.dynamicsReference.count > 1 ? "s" : ""})` : "—",
  };
}

/** « 261, soit 1,5 fois ta moyenne hebdo des 4 semaines précédentes (174) » : valeur, ratio et référence ensemble. */
export function loadLine(figure: { value: number; reference: number; ratio: number | null }): string {
  return figure.ratio == null ? `${figure.value} (pas encore de moyenne de référence)` : `${figure.value}, soit ${formatNumber(figure.ratio, 1)} fois ta moyenne hebdo des 4 semaines précédentes (${figure.reference})`;
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

/** Causes que le moteur autorise : facteurs du contexte qui peuvent expliquer un écart (sinon, aucune). */
export function possibleCauses(context: SessionContextInput | null, feeling: { perceivedEffort: number | null; note: string } | null | undefined): string[] {
  const causes: string[] = [];
  if (context?.loadAlertBefore?.actionable) causes.push(`hausse de charge corroborée (${context.loadAlertBefore.reasons.join(", ")})`);
  const spacing = context?.rhythm?.qualitySpacingDays ?? 3;
  for (const entry of context?.qualityBefore14d ?? []) if (entry.daysBefore < spacing) causes.push(`${entry.title}, ${entry.daysBefore} jour${entry.daysBefore > 1 ? "s" : ""} avant`);
  for (const flag of context?.recovery.flags ?? []) causes.push(FLAG_TEXT[flag] ?? flag);
  if (feeling?.perceivedEffort != null && feeling.perceivedEffort >= 8) causes.push(`effort perçu ${feeling.perceivedEffort}/10`);
  if (feeling?.note) causes.push("ressenti noté par l'athlète");
  return causes;
}

export function buildSessionPayload(input: {
  session: Session;
  metrics: ActivityMetrics;
  deltas: ComparisonDeltas;
  verdict: SessionVerdict;
  comparables: Comparable[];
  zones: HeartRateZones;
  lactateThresholdSpeedMps: number | null;
  /** D'où vient le seuil retenu (« seuil observé 4:10/km (…), la montre l'estime à 4:21/km »). */
  thresholdBasis?: string | null;
  context: SessionContextInput | null;
  goal: Record<string, string>;
  /** Levier principal et action pour chaque objectif chiffré (moteur). */
  goalGaps?: string[];
  feeling?: { perceivedEffort: number | null; note: string } | null;
  prescription?: Prescription | null;
}) {
  const { session, metrics, deltas, verdict, zones, context } = input;
  // Chaque FC porte sa zone : Claude ne peut plus se tromper de zone.
  const bpm = (value: number | null | undefined): string => {
    if (value == null) return "—";
    // Zone de la valeur AFFICHÉE (arrondie) : 166,6 bpm s'écrit 167 bpm, donc Z5 si le plancher de Z5 est 167.
    const rounded = Math.round(value);
    const zone = zoneOf(rounded, zones);
    return `${rounded} bpm (${zone === 0 ? "sous Z1" : `Z${zone}`})`;
  };
  const work = metrics.work;
  // Répétitions courtes : l'allure de chacune est du bruit GPS, on ne la transmet pas.
  const shortReps = work != null && work.averageDurationS < SHORT_REP_S;
  const gain = deltas.paceAtEqualHrGainSPerKm;
  const hrDelta = deltas.hrAtEqualPaceDeltaBpm;
  const workGain = deltas.work?.paceAtEqualHrGainSPerKm ?? null;
  const prescription = input.prescription ?? null;
  return {
    format_reconnu: prescription?.status === "none" ? `non : ${prescription.reason}` : "oui",
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
          repetitions: `${work.reps} répétitions de ${work.averageDurationS < 600 ? formatClock(work.averageDurationS) : formatDuration(work.averageDurationS)}${work.averageDistanceM ? ` (${formatDistance(work.averageDistanceM, 2)})` : ""}`,
          allure_repetitions: formatPace(work.averageSpeedMps),
          fc_moyenne_repetitions: bpm(work.averageHeartRateBpm),
          fc_max_moyenne_repetitions: bpm(work.peakHeartRateBpm),
          ...(shortReps
            ? { precision: `répétitions de moins de ${SHORT_REP_S} s : l'allure de chacune est imprécise au GPS, seules la moyenne, la FC et la tenue en fin de série comptent` }
            : { ecart_entre_rep_la_plus_rapide_et_la_plus_lente: work.paceSpreadSPerKm == null ? "—" : `${work.paceSpreadSPerKm} s/km` }),
          evolution_premieres_vs_dernieres: work.fadeSPerKm == null ? "—" : work.fadeSPerKm === 0 ? "même allure" : `dernières ${Math.abs(work.fadeSPerKm)} s/km plus ${work.fadeSPerKm > 0 ? "lentes" : "rapides"}`,
          // Chrono (1:30) et non « 1 min » : formatDuration tronque les secondes.
          recuperation_moyenne: work.averageRecoveryS ? formatClock(work.averageRecoveryS) : "—",
          detail_repetitions: shortReps ? "—" : work.repsDetail.slice(0, 8).map((rep, index) => `#${index + 1} ${formatClock(rep.durationS)}${rep.distanceM ? ` ${formatDistance(rep.distanceM, 2)}` : ""} à ${formatPace(rep.speedMps)}, FC ${bpm(rep.heartRateBpm)}, max ${bpm(rep.maxHeartRateBpm)}${rep.recoveryAfterS ? `, récup ${formatClock(rep.recoveryAfterS)}` : ""}`),
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
      ecart_face_aux_comparables: verdict.signals.find((signal) => signal.primary)?.label ?? "—",
      comparaison_fragile: verdict.fewComparables,
      // Texte d'origine quand toutes les séances sont du même format et de moins d'un an (charge utile inchangée).
      criteres: input.comparables.some((run) => run.nature === "family" || run.older)
        ? "d'abord même format de répétitions, durée et dénivelé proches, moins d'un an ; faute de 3 séances, même famille (fractionné court ou long, format différent : seules l'allure moyenne des répétitions et la FC se comparent, pas la régularité) et jusqu'à 2 ans"
        : "même famille de séance, même format de répétitions, durée et dénivelé proches, moins d'un an",
      seances: input.comparables.map((run) => ({
        ...(run.nature === "family" ? { nature: "même famille, format différent" } : {}),
        ...(run.older ? { ancienne: "plus d'un an : repère moins fiable" } : {}),
        date: formatDate(run.localDate, "medium"),
        anciennete: ageText(run.ageDays),
        type: run.title,
        duree: formatClock(run.movingTimeS),
        distance: formatDistance(run.distanceM, 2),
        ...(work ? { allure_repetitions: formatPace(run.workSpeedMps), fc_repetitions: bpm(run.workHeartRateBpm) } : { allure: formatPace(run.mainSpeedMps), fc: bpm(run.mainHeartRateBpm) }),
      })),
      ...(work
        ? {
            repetitions_comparables: deltas.work?.reference ? { allure: formatPace(deltas.work.reference.speedMps), fc: bpm(deltas.work.reference.heartRateBpm), ...(shortReps ? {} : { ecart_entre_rep_la_plus_rapide_et_la_plus_lente: deltas.work.reference.paceSpreadSPerKm == null ? "—" : `${deltas.work.reference.paceSpreadSPerKm} s/km` }) } : null,
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
          charge_garmin_7_jours_avant_la_seance: context.loadBefore ? loadLine(context.loadBefore) : "—",
          hausse_de_charge: !context.loadAlertBefore?.ratioHigh ? "non" : context.loadAlertBefore.actionable ? `corroborée : ${context.loadAlertBefore.reasons.join(", ")}` : "ratio élevé mais non corroboré (ni signal de récupération, ni ressenti élevé, ni charge inhabituelle) : simple repère",
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
    causes_possibles: (() => { const causes = possibleCauses(context, input.feeling); return causes.length ? causes : "aucune"; })(),
    objectif: input.goal,
    ...(input.goalGaps?.length ? { ecart_objectif: input.goalGaps } : {}),
    ressenti: input.feeling ? { effort_percu: input.feeling.perceivedEffort != null ? `${input.feeling.perceivedEffort}/10` : "—", note: input.feeling.note || "—" } : "non renseigné",
    verdict_calcule: {
      niveau: VERDICT_LABELS[verdict.level],
      signaux: verdict.signals.map((signal) => `${signal.primary ? "PRINCIPAL " : ""}${signal.tone === "good" ? "positif" : signal.tone === "watch" ? "à surveiller" : "neutre"} : ${signal.label}`),
    },
    consignes_moteur: describePrescription(input.prescription ?? null),
    reperes_athlete: {
      zones_fc: Object.fromEntries(([1, 2, 3, 4, 5] as const).map((zone) => [ZONE_LABELS[zone], `${zoneRange(zone, zones)[0]}–${zoneRange(zone, zones)[1]} bpm`])),
      seuil: input.lactateThresholdSpeedMps && zones.lactateThresholdHeartRateBpm ? `${formatPace(input.lactateThresholdSpeedMps)} à ${thresholdAtZ4Z5Boundary(zones) ? `${zones.lactateThresholdHeartRateBpm} bpm (limite Z4–Z5)` : bpm(zones.lactateThresholdHeartRateBpm)}${input.thresholdBasis ? ` (${input.thresholdBasis})` : ""}` : "—",
    },
  };
}

export type SessionPayload = ReturnType<typeof buildSessionPayload>;

/** Cible lisible : « allure 5 km réaliste : 4:03–4:09/km, 167–180 bpm (Z5) ». La plage de zones suit la FC. */
export function targetText(target: PrescriptionTarget): string {
  const pace = target.paceFastS != null && target.paceSlowS != null ? `${formatPace(1000 / target.paceFastS).replace("/km", "")}–${formatPace(1000 / target.paceSlowS)}, ` : "";
  return `${target.label} : ${pace}${target.heartRateLow}–${target.heartRateHigh} bpm (${target.zone})`;
}

function describePrescription(prescription: Prescription | null) {
  if (!prescription) return null;
  if (prescription.status === "none") return { note: `pas de consigne chiffrée (${prescription.reason})` };
  return {
    cible_du_format: targetText(prescription.target),
    aurait_du: prescription.shouldHave.length ? prescription.shouldHave : ["rien à corriger sur l'exécution"],
    a_reproduire: prescription.keep ?? "—",
    prochaine_fois: prescription.next.cue,
    ...(prescription.goal ? { repere_du_moment: paceReferenceSentence(prescription.goal) } : {}),
  };
}

export function buildSessionPrompt(payload: SessionPayload): string {
  return `Analyse cette séance.\n\n${JSON.stringify(payload)}`;
}
