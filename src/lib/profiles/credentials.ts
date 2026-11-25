import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { sessionCookieName } from "@/lib/env/environment";

/**
 * Codes d'accès, jetons de session et d'invitation. Fonctions pures (hors aléa), testées.
 * Le site est joignable depuis Internet pendant le test : codes longs générés
 * (jamais choisis), jamais stockés en clair (sel + scrypt) ; jetons aléatoires de
 * 256 bits dont seule l'empreinte SHA-256 est stockée.
 */

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_GROUPS = 5;
const CODE_GROUP_LENGTH = 4;

/** Code de secours lisible : « k7m2-p9xa-3rtd-w4hn-8qse » (≈ 99 bits). */
export function generateAccessCode(): string {
  const groups: string[] = [];
  for (let group = 0; group < CODE_GROUPS; group += 1) {
    let chunk = "";
    for (let index = 0; index < CODE_GROUP_LENGTH; index += 1) chunk += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    groups.push(chunk);
  }
  return groups.join("-");
}

/** Longueur du code personnel d'un invité : court, en chiffres, facile à taper sur téléphone. */
export const GUEST_CODE_LENGTH = 6;

/**
 * Code personnel d'un invité : 6 chiffres. Toujours demandé avec le prénom ; les essais en série
 * sont freinés (5 échecs par adresse → 15 min, 20 échecs par heure au total → 30 min), soit des
 * années pour balayer le million de combinaisons d'un seul prénom.
 */
export function generateGuestCode(): string {
  let code = "";
  for (let index = 0; index < GUEST_CODE_LENGTH; index += 1) code += String(randomInt(10));
  return code;
}

/** Prénom saisi à la connexion : sans accents, casse ni espaces de bord (« Benoît » = « benoit »). */
export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normalise la saisie (majuscules, espaces, tirets oubliés). */
export function normalizeCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Un code d'une autre longueur n'est même pas comparé : code invité (6 chiffres) ou code long (administrateur, anciens invités). */
export function plausibleCode(code: string): boolean {
  const normalized = normalizeCode(code);
  return normalized.length === CODE_GROUPS * CODE_GROUP_LENGTH || /^\d{6}$/.test(normalized);
}

export function hashCode(code: string, salt = randomBytes(16).toString("hex")): { hash: string; salt: string } {
  return { hash: scryptSync(normalizeCode(code), salt, 32).toString("hex"), salt };
}

export function verifyCode(code: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(normalizeCode(code), salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

/** Cookie de session de l'environnement en cours (prod : `sillage_session`, test : `sillage_test_session`). */
export const SESSION_COOKIE = sessionCookieName();
/** Session longue sur l'appareil (cookie persistant, pas de cookie de session : iOS les perd). */
export const SESSION_TTL_S = 180 * 86_400;
export const INVITATION_TTL_MS = 7 * 86_400_000;

/** Jeton aléatoire (cookie de session ou lien d'invitation). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Seule l'empreinte du jeton est stockée : une fuite du registre ne donne aucune session. */
export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Libellé d'appareil lisible tiré du User-Agent (journal et liste des appareils). */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "appareil inconnu";
  const ua = userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "appareil";
  const browser = /EdgA?\//.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "navigateur";
  return `${os}, ${browser}`;
}

/**
 * Freine les essais : par adresse (5 échecs → 15 min) et au global (20 échecs en
 * une heure → toutes les connexions par code bloquées 30 min). Le blocage global
 * tient même si l'adresse vue n'est pas fiable.
 */
export function createLoginThrottle(options: { perKeyFailures?: number; perKeyLockMs?: number; globalFailures?: number; globalWindowMs?: number; globalLockMs?: number } = {}) {
  const perKeyFailures = options.perKeyFailures ?? 5;
  const perKeyLockMs = options.perKeyLockMs ?? 15 * 60_000;
  const globalFailures = options.globalFailures ?? 20;
  const globalWindowMs = options.globalWindowMs ?? 60 * 60_000;
  const globalLockMs = options.globalLockMs ?? 30 * 60_000;
  const byKey = new Map<string, { count: number; lockedUntil: number }>();
  let recentFailures: number[] = [];
  let globalLockedUntil = 0;
  return {
    /** Millisecondes d'attente restantes pour cette adresse (0 = libre). */
    lockedFor(key: string, now: number): number {
      const entry = byKey.get(key);
      return Math.max(entry && entry.lockedUntil > now ? entry.lockedUntil - now : 0, globalLockedUntil > now ? globalLockedUntil - now : 0);
    },
    fail(key: string, now: number): void {
      const entry = byKey.get(key) ?? { count: 0, lockedUntil: 0 };
      entry.count += 1;
      if (entry.count >= perKeyFailures) {
        entry.lockedUntil = now + perKeyLockMs;
        entry.count = 0;
      }
      byKey.set(key, entry);
      recentFailures = [...recentFailures.filter((at) => at > now - globalWindowMs), now];
      if (recentFailures.length >= globalFailures) {
        globalLockedUntil = now + globalLockMs;
        recentFailures = [];
      }
    },
    succeed(key: string): void {
      byKey.delete(key);
    },
  };
}
