import "server-only";

import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { inArray } from "drizzle-orm";
import { closeDbFor, databasePathFor, getDbFor } from "@/lib/db/client";
import { coachChatMessages, coachOutputs, coachUsage } from "@/lib/db/schema";
import { getRegistry, runAs, toMember } from "@/lib/profiles/context";
import { ADMIN_ID } from "@/lib/profiles/registry";
import { TEST_PROFILE_ID } from "@/lib/profiles/types";
import { loadContext } from "./analytics";
import { adoptCoachOutputs, currentCoachOutputs } from "./coach-service";
import { newInvitation } from "./profiles-admin";

/**
 * Profil invité de test de Bastien. Sa base est une COPIE de celle de Bastien
 * (sauvegarde SQLite cohérente, base de Bastien seulement lue). À chaque
 * réinitialisation : nouvelle copie, sans consommation ni échanges du coach,
 * première connexion à refaire (accueil), appareils déconnectés, nouveau lien.
 * Les analyses à jour de Bastien sont reprises sans appel (aucune « préparation »).
 */

/** Dernières séances dont l'analyse est reprise si elle est à jour chez Bastien. */
export const ADOPTED_SESSIONS = 20;

let resetting = false;

function currentRunCount(): number {
  return loadContext().runs.length;
}

export async function resetTestProfile(base: string): Promise<{ link: string; expiresAt: string; runs: number; adopted: number }> {
  if (resetting) throw new Error("Réinitialisation déjà en cours.");
  resetting = true;
  try {
    const registry = getRegistry();
    const admin = registry.find(ADMIN_ID) ?? registry.ensureAdmin();
    const existing = registry.find(TEST_PROFILE_ID);
    if (existing && existing.testOf == null) throw new Error(`Un profil « ${TEST_PROFILE_ID} » existe déjà et n'est pas un profil de test.`);
    const record = existing ?? registry.createTestGuest({ id: TEST_PROFILE_ID, name: admin.name, testOf: ADMIN_ID });
    // Appareils déconnectés AVANT de remplacer la base : plus aucune requête du profil de test.
    registry.resetFirstVisit(record.id);
    const member = toMember(record);
    const adminMember = toMember(admin);

    // 1. Nouvelle copie de la base de Bastien (lue seulement).
    closeDbFor(member);
    const target = databasePathFor(member);
    if (target === databasePathFor(adminMember)) throw new Error("Chemin de base du profil de test invalide.");
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${target}${suffix}`, { force: true });
    mkdirSync(dirname(target), { recursive: true });
    await getDbFor(adminMember).$client.backup(target);

    // 2. Ce qui ne doit pas suivre : consommation, fil du coach, bilans et synthèses réservés à Bastien.
    const copy = getDbFor(member);
    copy.delete(coachUsage).run();
    copy.delete(coachChatMessages).run();
    copy.delete(coachOutputs).where(inArray(coachOutputs.kind, ["weekly", "feedback"])).run();

    // 3. Analyses reprises : à jour chez Bastien, réétiquetées pour la version vouvoyée.
    const outputs = runAs(adminMember, () => currentCoachOutputs(ADOPTED_SESSIONS));
    const adopted = runAs(member, () => adoptCoachOutputs(outputs));
    const runs = runAs(member, () => currentRunCount());

    // 4. Profil prêt (pas de « Préparer le profil ») et nouveau lien d'invitation.
    const now = new Date().toISOString();
    registry.setSetting(`prepare_${record.id}`, { stage: "ready", startedAt: now, updatedAt: now, activities: runs, runs, pendingDetails: 0, analyses: adopted, note: "Copie de ta base, analyses reprises sans appel." });
    const invitation = newInvitation(record.id, base);
    return { ...invitation, runs, adopted };
  } finally {
    resetting = false;
  }
}
