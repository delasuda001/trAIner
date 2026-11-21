import { z } from "zod";
import { getRegistry } from "@/lib/profiles/context";
import { shouldShowTour, tourSeenKey } from "@/lib/tour/tour";

/** Visite guidée à ouvrir d'office pour ce profil (jamais vue, ou accueil réinitialisé depuis). */
export function tourPending(profileId: string): boolean {
  const registry = getRegistry();
  return shouldShowTour(registry.getSetting(tourSeenKey(profileId), z.string()), registry.getSetting(`guide_reset_${profileId}`, z.string()));
}
