export function formatDistance(meters?: number | null): string {
  return meters == null ? "—" : `${(meters / 1000).toFixed(2).replace(".", ",")} km`;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60).toString().padStart(2, "0")} s`;
}

export function formatPace(speed?: number | null): string {
  if (!speed || speed <= 0) return "—";
  const totalSeconds = Math.round(1000 / speed);
  return `${Math.floor(totalSeconds / 60)}'${String(totalSeconds % 60).padStart(2, "0")}/km`;
}

export function formatDate(value?: string): string {
  if (!value) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}