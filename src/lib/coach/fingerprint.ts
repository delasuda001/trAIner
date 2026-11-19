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

/**
 * « full » : l'empreinte complète correspond ; « goal-free » : seul l'objectif (ou l'écart à
 * l'objectif) a changé, la sortie reste valable sauf ce qui parle de l'objectif ; null : périmée.
 */
export function fingerprintMatch(stored: string, promptVersion: string, payload: unknown, goalFreePayload?: () => unknown): "full" | "goal-free" | null {
  const [full, goalFree] = stored.split("~");
  if (full === hashPayload(promptVersion, payload)) return "full";
  if (!goalFree || !goalFreePayload) return null;
  const free = goalFreePayload();
  return free != null && goalFree === hashPayload(promptVersion, free) ? "goal-free" : null;
}

/** À jour si l'empreinte complète correspond, ou si seul l'objectif a changé (seconde empreinte identique). */
export function fingerprintIsCurrent(stored: string, promptVersion: string, payload: unknown, goalFreePayload?: () => unknown): boolean {
  return fingerprintMatch(stored, promptVersion, payload, goalFreePayload) != null;
}
