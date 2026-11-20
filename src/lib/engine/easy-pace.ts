import { median } from "./stats";

/**
 * Allure facile tirée de ce que la personne court vraiment.
 *
 * La traduction FC → allure (vitesse ∝ FC − FC de repos) suppose qu'on ralentit nettement quand la
 * FC baisse ; chez certains coureurs l'allure facile bouge à peine avec la FC (chaleur, fatigue,
 * capteur optique), et le modèle prescrivait des footings 40 à 60 s/km plus lents que ceux qu'ils
 * courent dans cette même zone. Règles, dans l'ordre :
 * 1. Au moins 3 footings sur route courus aux FC où la cible est calculée (haut de la zone visée ;
 *    6 dernières semaines, sinon 12) :
 *    la fourchette entoure la médiane de ses 6 plus récents (un sixième plus vite, le reste plus lent : un footing ne se prescrit pas plus vite que d'habitude),
 *    large comme leur écart interquartile (entre 20 et 30 s/km).
 * 2. Sinon, la fourchette du modèle, dont le bas (allure la plus lente) ne dépasse pas l'allure
 *    médiane de ses footings de plus de 30 s/km (3 footings au moins).
 * Les footings de récupération ne passent pas par ici (volontairement plus lents).
 */

export type EasySample = { paceS: number; heartRateBpm: number; localDate?: string };

const MIN_RUNS = 3;
const RECENT_RUNS = 6;
const MIN_WIDTH_S = 20;
const MAX_WIDTH_S = 30;
const RECENT_WINDOW_DAYS = 42;

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export const EASY_SLOWER_LIMIT_S = 30;

function quantile(sorted: number[], share: number): number {
  const position = (sorted.length - 1) * share;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function easyPaceRange(model: { fastS: number; slowS: number } | null, target: { heartRateLow: number; heartRateHigh: number }, samples: EasySample[] | null | undefined): { fastS: number; slowS: number } | null {
  const all = samples ?? [];
  // Les 6 dernières semaines d'abord (la forme change, l'été ralentit) ; 12 semaines s'il en manque.
  const latest = all.reduce((max, sample) => ((sample.localDate ?? "") > max ? (sample.localDate ?? "") : max), "");
  const recentFrom = latest ? shiftDate(latest, -RECENT_WINDOW_DAYS) : "";
  const zoneSamples = all.filter((sample) => sample.heartRateBpm >= target.heartRateLow && sample.heartRateBpm <= target.heartRateHigh);
  const recentZone = zoneSamples.filter((sample) => (sample.localDate ?? "") >= recentFrom);
  const inZone = (recentZone.length >= MIN_RUNS ? recentZone : zoneSamples)
    .sort((a, b) => (b.localDate ?? "").localeCompare(a.localDate ?? ""))
    .slice(0, RECENT_RUNS)
    .map((sample) => sample.paceS)
    .sort((a, b) => a - b);
  if (inZone.length >= MIN_RUNS) {
    let fast = quantile(inZone, 0.25);
    let slow = quantile(inZone, 0.75);
    // Largeur bornée (20 à 30 s/km) autour de la médiane de ces sorties.
    const width = Math.min(MAX_WIDTH_S, Math.max(MIN_WIDTH_S, slow - fast));
    const middle = quantile(inZone, 0.5);
    // Penchée vers le lent : un footing se prescrit à son allure habituelle ou un peu en dessous, jamais au-dessus.
    fast = middle - width / 6;
    slow = middle + (5 * width) / 6;
    return { fastS: Math.round(fast), slowS: Math.round(slow) };
  }
  if (!model) return null;
  if (all.length < MIN_RUNS) return model;
  const limit = Math.round((median(all.map((sample) => sample.paceS)) as number) + EASY_SLOWER_LIMIT_S);
  if (model.slowS <= limit) return model;
  const shift = model.slowS - limit;
  return { fastS: model.fastS - shift, slowS: limit };
}
