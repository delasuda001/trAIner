import "server-only";

import { z } from "zod";
import { generateAccessCode, generateToken } from "@/lib/profiles/credentials";
import { getRegistry } from "@/lib/profiles/context";
import { memberIdFromName } from "@/lib/profiles/types";

export const PUBLIC_URL_KEY = "public_url";
/** Bastien confirme avoir désactivé « Aider à améliorer Claude » sur son compte claude.ai. */
export const TRAINING_OPT_OUT_KEY = "claude_training_opt_out";

export function trainingOptOut(): boolean {
  return getRegistry().getSetting(TRAINING_OPT_OUT_KEY, z.boolean()) === true;
}

/** Adresse publique (tunnel) pour les liens d'invitation ; à défaut, l'adresse vue par le navigateur. */
export function publicUrl(fallbackOrigin: string): { url: string; configured: boolean } {
  const stored = getRegistry().getSetting(PUBLIC_URL_KEY, z.string().url()) ?? process.env.SILLAGE_PUBLIC_URL ?? null;
  return stored ? { url: stored.replace(/\/$/, ""), configured: true } : { url: fallbackOrigin, configured: false };
}

export function invitationLink(base: string, token: string): string {
  return `${base}/api/session/invitation?t=${token}`;
}

/** Crée un invité ; renvoie son lien et son code UNE fois (ils ne sont jamais relisibles). */
export function createGuestProfile(name: string, base: string) {
  const registry = getRegistry();
  let id = memberIdFromName(name);
  for (let suffix = 2; registry.find(id); suffix += 1) id = `${memberIdFromName(name).slice(0, 20)}${suffix}`;
  const code = generateAccessCode();
  const record = registry.createGuest({ id, name, code });
  const token = generateToken();
  const { expiresAt } = registry.createInvitation(id, token);
  return { record, code, link: invitationLink(base, token), expiresAt };
}

export function newInvitation(id: string, base: string) {
  const token = generateToken();
  const { expiresAt } = getRegistry().createInvitation(id, token);
  return { link: invitationLink(base, token), expiresAt };
}

export function newCode(id: string) {
  const code = generateAccessCode();
  getRegistry().setCode(id, code);
  return { code };
}
