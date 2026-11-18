import { z } from "zod";

/**
 * Profils de l'application (test familial). Bastien est l'administrateur ;
 * son père et son frère sont des invités. Chaque profil a sa propre base SQLite :
 * aucune donnée d'entraînement n'est partagée entre profils.
 */
export const MEMBER_ROLES = ["admin", "guest"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export type Member = {
  id: string;
  name: string;
  role: MemberRole;
};

export const MEMBER_ID_PATTERN = /^[a-z][a-z0-9]{1,23}$/;

/** Profil complet tel que stocké dans le registre (jamais envoyé tel quel au navigateur). */
export type MemberRecord = Member & {
  hasCode: boolean;
  /** Variable d'environnement qui porte la clé Garmin du profil. */
  garminEnvVar: string;
  dailyTokenCap: number | null;
  weeklyTokenCap: number | null;
  createdAt: string;
  lastLoginAt: string | null;
  onboardedAt: string | null;
  disabledAt: string | null;
  /** Profil de test : identifiant du profil dont il copie la base (sinon null). */
  testOf: string | null;
};

/** Profil invité de test de Bastien (copie de sa base, réinitialisable). */
export const TEST_PROFILE_ID = "bastientest";

export const DEFAULT_GUEST_DAILY_CAP = 40_000;
export const DEFAULT_GUEST_WEEKLY_CAP = 150_000;
/** Plafond commun à tous les invités sur 7 jours glissants. */
export const DEFAULT_GUESTS_WEEKLY_CAP = 250_000;

/** Nom de la variable de clé Garmin d'un profil : la clé historique pour l'administrateur. */
export function garminEnvVarFor(id: string, role: MemberRole): string {
  return role === "admin" ? "GARMIN_API_KEY" : `GARMIN_API_KEY_${id.toUpperCase()}`;
}

/** Identifiant technique dérivé du nom affiché (« Frère » → « frere »). */
export function memberIdFromName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^[0-9]+/, "")
    .slice(0, 24);
  return base.length >= 2 ? base : `profil${base}`;
}

export const capsSchema = z.object({
  dailyTokenCap: z.number().int().min(0).max(5_000_000).nullable(),
  weeklyTokenCap: z.number().int().min(0).max(20_000_000).nullable(),
});
