import type { ActivityMetrics } from "./activity-metrics";

/**
 * Pistes de travail « à côté » de la séance, déclenchées par ce que la séance montre, chacune
 * avec un dosage concret. Repères d'entraîneur courants, présentés comme des pistes (jamais une
 * prescription certaine ni un avis médical). Pur, testé ; le coach ne cite que ces pistes.
 *
 * Déclencheurs :
 * - foulée qui se dégrade en fin d'effort (au moins deux indicateurs : contact au sol +8 ms,
 *   cadence −3 pas/min, oscillation) → renforcement, gammes et lignes droites, consigne de cadence ;
 * - fin d'effort plus lente (2e moitié ou dernières répétitions plus lentes de 5 s/km ou plus) →
 *   tenue de l'allure : départ, volume, et sortie longue avec fin progressive ;
 * - levier principal de l'objectif = fréquence ou volume → la tenue vient d'abord du volume.
 */

export type SideWork = { topic: "strength" | "drills" | "cadence" | "pacing" | "volume" | "long_run"; text: string };

const FADE_S_PER_KM = 5;

export function strideFatigue(metrics: ActivityMetrics): string[] {
  const dynamics = metrics.dynamics;
  if (!dynamics) return [];
  const { early, late } = dynamics;
  const signs: string[] = [];
  if (early.groundContactMs != null && late.groundContactMs != null && late.groundContactMs - early.groundContactMs >= 8) signs.push("contact au sol");
  if (early.cadenceSpm != null && late.cadenceSpm != null && early.cadenceSpm - late.cadenceSpm >= 3) signs.push("cadence");
  if (early.verticalOscillationMm != null && late.verticalOscillationMm != null && late.verticalOscillationMm - early.verticalOscillationMm >= 5) signs.push("oscillation");
  return signs.length >= 2 ? signs : [];
}

export function sideWork(input: { metrics: ActivityMetrics; goalLever?: "frequency" | "volume" | "long_run" | "threshold" | null }): SideWork[] {
  const { metrics } = input;
  const items: SideWork[] = [];
  const stride = strideFatigue(metrics);
  if (stride.length) {
    items.push({ topic: "strength", text: "Renforcement pour tenir la foulée en fin d'effort : 2 séances de 15 à 20 min par semaine (montées sur pointes, fentes, squats sur une jambe, gainage), pas la veille d'une séance de qualité." });
    items.push({ topic: "drills", text: "Gammes et lignes droites : après un footing par semaine, 10 min de gammes (talons-fesses, montées de genoux, foulées bondissantes) puis 6 lignes droites de 80 m, relâchées, récupération en marchant." });
    if (stride.includes("cadence")) items.push({ topic: "cadence", text: "Cadence : quand la fatigue arrive, garde le rythme des pas et raccourcis un peu la foulée plutôt que de laisser la cadence tomber." });
  }
  const fade = metrics.work ? metrics.work.fadeSPerKm ?? 0 : metrics.halves?.fadeSPerKm ?? 0;
  if (fade >= FADE_S_PER_KM && metrics.family !== "easy") {
    items.push(metrics.work
      ? { topic: "pacing", text: "Tenue des répétitions : pars la 1re à l'allure de la dernière que tu peux tenir ; la série doit finir aussi vite qu'elle a commencé." }
      : { topic: "long_run", text: "Tenue sur la durée : une sortie longue par semaine en Z2, avec les 10 dernières minutes un peu plus vite, apprend à finir sans ralentir." });
  }
  if (input.goalLever === "frequency" || input.goalLever === "volume") items.push({ topic: "volume", text: "La tenue en fin de course vient d'abord du volume : avant d'ajouter de l'intensité, ajoute du temps en endurance facile, comme le dit ton objectif." });
  return items.slice(0, 3);
}
