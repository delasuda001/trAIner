import type { HeartRateZones } from "@/lib/source/types";
import type { SessionFamily, SessionKind } from "@/lib/engine/activity-metrics";
import type { Prescription } from "@/lib/engine/prescription";
import { hasTutoiement } from "@/lib/register";

/**
 * Contrôleur de cohérence : des invariants qui doivent TOUJOURS tenir, vérifiés en code
 * (déterministe, gratuit) après chaque analyse. Il ne juge pas la qualité d'un conseil :
 * il attrape ce qui est faux à coup sûr (consigne sans rapport avec ce que la personne
 * court, type de séance incompatible avec sa durée ou sa FC, comparaison chiffrée fausse,
 * texte mal formé). Les anomalies vont dans la vue admin, jamais chez un invité.
 */

export type FindingSeverity = "error" | "warning";

export type Finding = {
  /** Identifiant stable de la règle (sert à regrouper les récurrences). */
  code: string;
  severity: FindingSeverity;
  /** Constat chiffré, lisible par Bastien. */
  message: string;
  /** Où : « consigne », « type de séance », « analyse Claude », « conseil du jour »… */
  where: string;
};

/** Repères de la personne, tirés de ses propres sorties récentes. */
export type EasyBaseline = {
  /** Allure médiane de ses sorties faciles (hors échauffement), s/km. */
  medianPaceS: number;
  /** FC médiane de ces mêmes sorties, bpm. */
  medianHeartRateBpm: number;
  runs: number;
  /** Chaque sortie facile (allure s/km, FC bpm) : la consigne se compare à celles courues à la même FC. */
  samples?: Array<{ paceS: number; heartRateBpm: number }>;
};

export type SessionCheckInput = {
  register: "tu" | "vous";
  zones: HeartRateZones;
  easy: EasyBaseline | null;
  session: {
    kind: SessionKind;
    family: SessionFamily;
    movingTimeS: number | null;
    mainHeartRateBpm: number | null;
    /** Plus longue durée de course des 12 semaines précédentes (s). */
    longestBeforeS: number | null;
  };
  /** `efficiencyTone` : ton du signal « allure à FC égale » (le niveau peut venir d'autres signaux). */
  verdict: { level: string; efficiencyTone: string | null; efficiencyGainSPerKm: number | null; spreadSPerKm: number | null };
  prescription: Prescription | null;
  /** Textes affichés : phrases du moteur (déjà au bon registre) et sortie de Claude. */
  texts: Array<{ where: string; text: string }>;
};

/** Au-delà, une consigne facile est plus lente que tout ce que la personne court en footing. */
export const EASY_PACE_GAP_LIMIT_S = 45;
const EASY_HR_ABOVE_Z2_BPM = 5;
const MIN_EASY_RUNS = 5;

function z2High(zones: HeartRateZones): number {
  return zones.floors[2] - 1;
}

function pace(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

/* ---------- Consignes et zones face à ce que la personne court ---------- */

/** Cible facile d'une consigne (endurance, récupération, sortie longue en Z2), s'il y en a une. */
export type EasyTarget = { paceSlowS: number | null; heartRateLow: number; heartRateHigh: number };

export function easyTargetOf(prescription: Prescription | null): EasyTarget | null {
  return prescription?.status === "ok" && /endurance|récupération/.test(prescription.target.label) ? { paceSlowS: prescription.target.paceSlowS, heartRateLow: prescription.target.heartRateLow, heartRateHigh: prescription.target.heartRateHigh } : null;
}

/** Marge de FC autour de la cible pour retenir les footings « courus à la même FC ». */
const SAME_HR_MARGIN_BPM = 3;
const MIN_SAME_HR_RUNS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function checkEasyTargets(input: Pick<SessionCheckInput, "zones" | "easy"> & { easyTarget: EasyTarget | null }, where = "consigne"): Finding[] {
  const findings: Finding[] = [];
  const { easy, zones } = input;
  if (!easy || easy.runs < MIN_EASY_RUNS) return findings;
  if (easy.medianHeartRateBpm >= z2High(zones) + EASY_HR_ABOVE_Z2_BPM) {
    findings.push({ code: "z2_below_easy_runs", severity: "warning", where: "zones", message: `Ses footings tournent à ${Math.round(easy.medianHeartRateBpm)} bpm (médiane de ${easy.runs} sorties) pour une Z2 qui s'arrête à ${z2High(zones)} bpm : chaque footing sera jugé « trop intense ».` });
  }
  const target = input.easyTarget;
  const slow = target?.paceSlowS ?? null;
  if (target && slow != null) {
    // Comparée à ce qu'il court à la MÊME FC (une sortie à FC basse est logiquement plus lente, et inversement).
    const sameHr = (easy.samples ?? []).filter((sample) => sample.heartRateBpm >= target.heartRateLow - SAME_HR_MARGIN_BPM && sample.heartRateBpm <= target.heartRateHigh + SAME_HR_MARGIN_BPM);
    if (sameHr.length >= MIN_SAME_HR_RUNS) {
      const reference = median(sameHr.map((sample) => sample.paceS));
      const gap = slow - reference;
      if (gap > EASY_PACE_GAP_LIMIT_S) {
        findings.push({ code: "easy_pace_far_slower", severity: "error", where, message: `Allure facile prescrite jusqu'à ${pace(slow)} pour ${target.heartRateLow}–${target.heartRateHigh} bpm, soit ${Math.round(gap)} s/km plus lent que ses footings courus à cette FC (${pace(reference)} en médiane sur ${sameHr.length} sorties).` });
      }
    }
  }
  return findings;
}

/* ---------- Type de séance face à sa durée et à sa FC ---------- */

export function checkClassification(input: Pick<SessionCheckInput, "zones" | "session">): Finding[] {
  const findings: Finding[] = [];
  const { session, zones } = input;
  const minutes = session.movingTimeS != null ? Math.round(session.movingTimeS / 60) : null;
  const hr = session.mainHeartRateBpm != null ? Math.round(session.mainHeartRateBpm) : null;
  if ((session.kind === "tempo" || session.kind === "threshold") && minutes != null && minutes >= 90) {
    findings.push({ code: "long_effort_as_quality", severity: "warning", where: "type de séance", message: `${minutes} min classées « ${session.kind === "tempo" ? "tempo" : "seuil"} » : une sortie de cette durée est une sortie longue (consignes « même effort, plus long » à proscrire).` });
  }
  if (session.kind === "threshold" && hr != null && hr < zones.floors[2]) {
    findings.push({ code: "threshold_below_z3", severity: "warning", where: "type de séance", message: `Classée « seuil » avec une FC moyenne de ${hr} bpm, sous la Z3 (${zones.floors[2]} bpm).` });
  }
  if (session.family === "easy" && hr != null && hr >= zones.floors[3]) {
    findings.push({ code: "easy_in_z4", severity: "warning", where: "type de séance", message: `Classée « facile » avec une FC moyenne de ${hr} bpm, en Z4 (dès ${zones.floors[3]} bpm).` });
  }
  return findings;
}

/* ---------- Consigne « plus long » après un effort exceptionnel ---------- */

export function checkProgressionCue(input: Pick<SessionCheckInput, "session" | "prescription">): Finding[] {
  const prescription = input.prescription;
  if (prescription?.status !== "ok") return [];
  const { movingTimeS, longestBeforeS } = input.session;
  const prolong = /prolongé|plus long|allonge/i.test(prescription.next.cue);
  if (prolong && movingTimeS != null && movingTimeS >= 75 * 60 && longestBeforeS != null && movingTimeS >= 1.5 * longestBeforeS) {
    return [{ code: "prolong_after_exceptional", severity: "error", where: "consigne", message: `Consigne « ${prescription.next.cue.slice(0, 80)} » après ${Math.round(movingTimeS / 60)} min, déjà 1,5 fois sa plus longue sortie des 12 semaines (${Math.round(longestBeforeS / 60)} min).` }];
  }
  return [];
}

/* ---------- Verdict face au bruit ---------- */

export function checkVerdict(input: Pick<SessionCheckInput, "verdict">): Finding[] {
  const { level, efficiencyTone, efficiencyGainSPerKm: gain, spreadSPerKm: spread } = input.verdict;
  if ((level === "below" || level === "above") && (efficiencyTone === "good" || efficiencyTone === "watch") && gain != null && spread != null && Math.abs(gain) < 0.5 * spread && Math.abs(gain) >= 6) {
    return [{ code: "verdict_within_noise", severity: "warning", where: "verdict", message: `Verdict « ${level === "below" ? "en dessous" : "au-dessus"} » sur ${Math.abs(gain)} s/km d'écart alors que les comparables varient de ${spread} s/km entre eux.` }];
  }
  return [];
}

/* ---------- Textes : comparaisons chiffrées, registre, gabarits ---------- */

const RANGE_CLAIM = /(\d+(?:,\d+)?)\s*(ms|bpm)\b[^.;:]{0,60}?\b(sous|au-dessus de|dans)\s+(?:sa |ta |votre |la )?plage(?: habituelle)?[^0-9.;]{0,15}(\d+)\s*[–-]\s*(\d+)/gi;

function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}

/** « 64 ms, sous votre plage habituelle (60–76 ms) » : la valeur est-elle vraiment hors de la plage citée ? */
export function checkRangeClaims(text: string, where: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of text.matchAll(RANGE_CLAIM)) {
    const value = toNumber(match[1]);
    const low = toNumber(match[4]);
    const high = toNumber(match[5]);
    const relation = match[3].toLowerCase();
    const wrong = (relation === "sous" && value >= low) || (relation === "au-dessus de" && value <= high) || (relation === "dans" && (value < low || value > high));
    if (wrong) findings.push({ code: "range_claim_false", severity: "error", where, message: `« ${match[0].trim()} » : ${match[1]} ${match[2]} n'est pas ${relation} ${low}–${high}.` });
  }
  return findings;
}

const VOUS_WITH_TU_VERB = /\b[Vv]ous (cours|courais|dois|peux|fais|as|es|tiens|vas|sais|veux|prends|pars)\b/g;
const MISSING_ELISION = /\b(de|que|le|ne|je|se) (effort|efforts|un|une|allure|endurance|intensité|accélération|objectif|écart|il|elle|on|aisance|entraînement|échauffement|aujourd'hui)\b/gi;
const TEMPLATE_LEFTOVER = /\$\{|\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/g;

export function checkText(text: string, where: string, register: "tu" | "vous"): Finding[] {
  const findings: Finding[] = [];
  const leftovers = text.match(TEMPLATE_LEFTOVER);
  if (leftovers) findings.push({ code: "template_leftover", severity: "error", where, message: `Gabarit mal rempli (${[...new Set(leftovers)].join(", ")}) : « ${excerptAround(text, leftovers[0])} ».` });
  if (register === "vous") {
    const verbs = text.match(VOUS_WITH_TU_VERB);
    if (verbs) findings.push({ code: "register_conjugation", severity: "error", where, message: `Verbe resté au « tu » après « vous » : « ${verbs[0]} ».` });
    if (hasTutoiement(text)) findings.push({ code: "register_tutoiement", severity: "error", where, message: `Tutoiement chez un invité : « ${text.slice(0, 120)} ».` });
  }
  const elision = text.match(MISSING_ELISION);
  if (elision) findings.push({ code: "missing_elision", severity: "warning", where, message: `Élision manquante : « ${elision[0]} ».` });
  return [...findings, ...checkRangeClaims(text, where)];
}

function excerptAround(text: string, token: string): string {
  const index = text.indexOf(token);
  return text.slice(Math.max(0, index - 40), index + token.length + 40).trim();
}

/* ---------- Ensemble ---------- */

export function checkSession(input: SessionCheckInput): Finding[] {
  const findings = [
    ...checkEasyTargets({ ...input, easyTarget: easyTargetOf(input.prescription) }),
    ...checkClassification(input),
    ...checkProgressionCue(input),
    ...checkVerdict(input),
    ...input.texts.flatMap((entry) => checkText(entry.text, entry.where, input.register)),
  ];
  // Une même règle au même endroit : une seule ligne.
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}|${finding.where}|${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Toutes les chaînes d'une sortie (analyse de Claude, consignes), à plat. */
export function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(stringsOf);
  return [];
}
