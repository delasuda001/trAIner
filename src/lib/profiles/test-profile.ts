import "server-only";

import { z } from "zod";
import { activeMember, getRegistry } from "./context";

/**
 * Profil invité de test de Bastien : il vit le parcours d'un invité sur une copie
 * de ses propres données. Son coach est simulé par défaut (aucun appel à Claude).
 */
export const TEST_COACH_SIMULATED_KEY = "test_profile_coach_simulated";

export function isTestProfile(id: string): boolean {
  return getRegistry().find(id)?.testOf != null;
}

/** Coach simulé pour le profil de test (réglage de Bastien, activé par défaut). */
export function testCoachSimulated(): boolean {
  return getRegistry().getSetting(TEST_COACH_SIMULATED_KEY, z.boolean()) ?? true;
}

/** Le profil actif est le profil de test et son coach est simulé. */
export function simulatedCoachForActive(): boolean {
  const member = activeMember();
  return member != null && member.role === "guest" && isTestProfile(member.id) && testCoachSimulated();
}
