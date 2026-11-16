/**
 * Formatage français partagé par l'UI ET par la charge utile envoyée à Claude :
 * les chiffres que Claude peut citer sont exactement ceux affichés à l'écran.
 */

const NBSP = " ";

export function secondsPerKm(speedMps: number): number {
  return 1000 / speedMps;
}

/** 4:43 (sans unité). */
export function formatPaceValue(speedMps: number | null | undefined): string {
  if (!speedMps || speedMps <= 0) return "—";
  const total = Math.round(secondsPerKm(speedMps));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 4:43/km */
export function formatPace(speedMps: number | null | undefined): string {
  const value = formatPaceValue(speedMps);
  return value === "—" ? value : `${value}/km`;
}

export function formatDistance(meters: number | null | undefined, digits = 1): string {
  if (meters == null) return "—";
  return `${(meters / 1000).toFixed(digits).replace(".", ",")}${NBSP}km`;
}

/** 1 h 05 / 47 min / 45 s */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}${NBSP}h${NBSP}${String(minutes).padStart(2, "0")}`;
  if (minutes > 0) return `${minutes}${NBSP}min`;
  return `${total % 60}${NBSP}s`;
}

/** 47:10 ou 1:02:15 (chrono). */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits).replace(".", ",");
}

/** +3, −5 (signe toujours affiché, vrai signe moins). */
export function formatSigned(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return formatNumber(0, digits);
  return `${rounded > 0 ? "+" : "−"}${formatNumber(Math.abs(rounded), digits)}`;
}

export function formatDate(value: string | null | undefined, style: "short" | "medium" | "long" = "medium"): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  const options: Intl.DateTimeFormatOptions =
    style === "short" ? { day: "numeric", month: "short" } : style === "long" ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("fr-FR", options).format(date);
}

export function formatRelativeDays(days: number): string {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}
