import { createHash } from "node:crypto";

/**
 * Empreintes des sorties du coach (cache). Une sortie peut porter deux empreintes,
 * « complète~sans-objectif » : la seconde, calculée sur la charge utile sans objectif,
 * évite qu'un objectif saisi après coup ne périme les analyses passées.
 */

export function hashPayload(promptVersion: string, payload: unknown): string {
  return createHash("sha256").update(promptVersion).update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

export function storedFingerprint(promptVersion: string, payload: unknown, goalFreePayload: unknown): string {
  const full = hashPayload(promptVersion, payload);
  return goalFreePayload == null ? full : `${full}~${hashPayload(promptVersion, goalFreePayload)}`;
}

/** À jour si l'empreinte complète correspond, ou si seul l'objectif a changé (seconde empreinte identique). */
export function fingerprintIsCurrent(stored: string, promptVersion: string, payload: unknown, goalFreePayload?: () => unknown): boolean {
  const [full, goalFree] = stored.split("~");
  if (full === hashPayload(promptVersion, payload)) return true;
  if (!goalFree || !goalFreePayload) return false;
  const free = goalFreePayload();
  return free != null && goalFree === hashPayload(promptVersion, free);
}
