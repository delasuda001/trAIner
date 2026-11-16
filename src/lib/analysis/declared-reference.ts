/**
 * Convertit une référence de performance déclarée par l'utilisateur (texte
 * libre, ex. "4:00 min/km" ou "4'00/km") en vitesse (m/s), UNIQUEMENT quand
 * le texte suit exactement le format d'allure déjà utilisé ailleurs dans
 * l'application (minutes:secondes ou minutes'secondes par km).
 *
 * Volontairement strict : `performanceReferences[].value` est un champ texte
 * libre (aucun format garanti, cf. src/lib/db/contracts.ts). Deviner un
 * format ambigu ("13 km/h", "sub-40 sur 10K"...) reviendrait à fabriquer une
 * donnée numérique absente — interdit. Un texte qui ne correspond pas
 * exactement au format attendu renvoie `null`, jamais une valeur approchée.
 */
const PACE_PATTERN = /^(\d{1,2})[:'](\d{2})\s*(?:min)?\s*\/\s*km$/i;

export function parseDeclaredPaceToSpeedMps(value: string): number | null {
  const match = PACE_PATTERN.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds >= 60) return null;
  const paceSecPerKm = minutes * 60 + seconds;
  if (paceSecPerKm <= 0) return null;
  return 1000 / paceSecPerKm;
}

/**
 * Résout la première référence de performance déclarée exploitable
 * numériquement. Renvoie `null` si aucune référence n'est déclarée, ou si
 * aucune ne suit un format d'allure reconnu — jamais une valeur inventée.
 */
export function resolveDeclaredReferenceSpeedMps(performanceReferences: ReadonlyArray<{ value: string }> | undefined): number | null {
  if (!performanceReferences) return null;
  for (const reference of performanceReferences) {
    const speedMps = parseDeclaredPaceToSpeedMps(reference.value);
    if (speedMps != null) return speedMps;
  }
  return null;
}
