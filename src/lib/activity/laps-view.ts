import type { Lap } from "@/lib/source/types";

/**
 * Vue réduite des tours d'un fractionné : les répétitions une à une, le reste regroupé
 * (échauffement, récupérations, retour au calme) en lignes de synthèse.
 */
export type LapGroup = {
  label: "Échauffement" | "Récupérations" | "Retour au calme";
  count: number;
  durationS: number;
  distanceM: number | null;
  /** Vitesse moyenne pondérée par la durée (m/s). */
  speedMps: number | null;
  heartRateBpm: number | null;
  maxHeartRateBpm: number | null;
};

export type CompactLapRow = { kind: "rep"; number: number; lap: Lap } | { kind: "group"; group: LapGroup };

function summarize(label: LapGroup["label"], laps: Lap[]): LapGroup | null {
  if (!laps.length) return null;
  const durationS = laps.reduce((sum, lap) => sum + lap.durationS, 0);
  const withDistance = laps.filter((lap) => lap.distanceM != null);
  const distanceM = withDistance.length ? withDistance.reduce((sum, lap) => sum + (lap.distanceM as number), 0) : null;
  const withHr = laps.filter((lap) => lap.averageHeartRateBpm != null);
  const hrTime = withHr.reduce((sum, lap) => sum + lap.durationS, 0);
  const maxes = laps.flatMap((lap) => (lap.maxHeartRateBpm != null ? [lap.maxHeartRateBpm] : []));
  return {
    label,
    count: laps.length,
    durationS,
    distanceM,
    speedMps: distanceM != null && durationS > 0 ? distanceM / durationS : null,
    heartRateBpm: hrTime > 0 ? Math.round(withHr.reduce((sum, lap) => sum + (lap.averageHeartRateBpm as number) * lap.durationS, 0) / hrTime) : null,
    maxHeartRateBpm: maxes.length ? Math.max(...maxes) : null,
  };
}

/** `null` si aucune répétition : la sortie continue garde la liste complète. */
export function compactLaps(laps: Lap[], isRep: (lap: Lap) => boolean): CompactLapRow[] | null {
  const ordered = [...laps].sort((a, b) => a.index - b.index);
  const first = ordered.findIndex(isRep);
  if (first < 0) return null;
  const last = ordered.length - 1 - [...ordered].reverse().findIndex(isRep);
  const reps = ordered.slice(first, last + 1).filter(isRep);
  const recoveries = ordered.slice(first, last + 1).filter((lap) => !isRep(lap));
  const groups = [summarize("Échauffement", ordered.slice(0, first)), null, summarize("Récupérations", recoveries), summarize("Retour au calme", ordered.slice(last + 1))];
  const rows: CompactLapRow[] = [];
  if (groups[0]) rows.push({ kind: "group", group: groups[0] });
  reps.forEach((lap, index) => rows.push({ kind: "rep", number: index + 1, lap }));
  for (const group of groups.slice(2)) if (group) rows.push({ kind: "group", group });
  return rows;
}
