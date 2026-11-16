/** Utilitaires de dates civiles (YYYY-MM-DD), sans dépendance au fuseau du serveur. */

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Découpe [start, end] (inclus) en fenêtres d'au plus `maxDays` jours. */
export function chunkDateRange(start: string, end: string, maxDays: number): Array<[string, string]> {
  const chunks: Array<[string, string]> = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = addDays(cursor, maxDays - 1);
    chunks.push([cursor, chunkEnd < end ? chunkEnd : end]);
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

/** Lundi de la semaine ISO contenant `date`. */
export function startOfIsoWeek(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** Date civile locale (fuseau de la machine) d'un instant. */
export function localDate(instant: Date = new Date()): string {
  const offset = instant.getTimezoneOffset() * 60_000;
  return new Date(instant.getTime() - offset).toISOString().slice(0, 10);
}
