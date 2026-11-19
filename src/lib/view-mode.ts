import { z } from "zod";

/**
 * Vue du tableau de bord, réglable par profil (Paramètres) : « essentiel » (prochaine
 * séance, jauge d'objectif, calendrier, forme aérobie en une ligne) ou « complète ».
 * Par défaut : essentiel pour un invité, complète pour Bastien.
 */
export const VIEW_MODE_KEY = "dashboard_view";
export const viewModeSchema = z.enum(["essential", "full"]);
export type ViewMode = z.infer<typeof viewModeSchema>;

export function defaultViewMode(role: string | null | undefined): ViewMode {
  return role === "admin" ? "full" : "essential";
}

/** Vue affichée : « ?vue=complete » ouvre le détail ponctuellement, sans changer le réglage. */
export function resolveViewMode(stored: ViewMode | null, role: string | null | undefined, query?: string | null): ViewMode {
  if (query === "complete") return "full";
  return stored ?? defaultViewMode(role);
}
