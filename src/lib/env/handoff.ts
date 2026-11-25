import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Passage de la prod au test sans se reconnecter : la prod signe un jeton court (profil, échéance)
 * avec un secret partagé du Mac (`SILLAGE_ENV_SECRET`, `.env.local`), le test le vérifie et ouvre une
 * session sur SA copie du registre. Réservé à l'administrateur, valable 60 s, à usage unique côté test.
 */

export const HANDOFF_TTL_MS = 60_000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createHandoffToken(memberId: string, secret: string, now = Date.now()): string {
  const payload = `${memberId}.${now + HANDOFF_TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyHandoffToken(token: string, secret: string, now = Date.now()): { memberId: string } | null {
  const match = /^([a-z0-9_-]{1,40})\.(\d{10,16})\.([A-Za-z0-9_-]{20,})$/.exec(token);
  if (!match || secret.length < 16) return null;
  const [, memberId, expires, signature] = match;
  const expected = Buffer.from(sign(`${memberId}.${expires}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(expires) < now || Number(expires) > now + HANDOFF_TTL_MS + 5_000) return null;
  return { memberId };
}
