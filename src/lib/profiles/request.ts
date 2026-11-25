import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { isTestEnv } from "@/lib/env/environment";
import { looksLikeToken, SESSION_COOKIE } from "./credentials";
import { getRegistry, runAs, toMember } from "./context";
import type { Member } from "./types";

export const GUESTS_SUSPENDED_KEY = "guests_suspended";

/** Coupure d'urgence : plus aucun invité ne peut entrer ni rester connecté. */
export function guestsSuspended(): boolean {
  return getRegistry().getSetting(GUESTS_SUSPENDED_KEY, z.boolean()) === true;
}

/** Profil de la requête courante (session d'appareil valide, profil actif, accès invité ouvert), ou null. */
export async function requestMember(): Promise<Member | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!looksLikeToken(token)) return null;
  const record = getRegistry().resolveSession(token);
  if (!record) return null;
  if (record.role === "guest" && guestsSuspended()) return null;
  // Environnement de test : Bastien seul (les données des invités n'y sont que des copies, vues par « voir comme »).
  if (isTestEnv() && record.role !== "admin") return null;
  return toMember(record);
}

/** Adresse du visiteur telle que relayée par le tunnel (dernier saut), pour le freinage et le journal. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).pop();
  return (last ?? headers.get("x-real-ip") ?? "local").slice(0, 64);
}

/**
 * Point d'entrée d'une page : résout le profil (sinon renvoie vers /connexion)
 * et exécute le calcul de la page sous ce profil. Tout accès en base doit avoir
 * lieu dans `render` (les composants ne lisent jamais la base eux-mêmes).
 */
export async function asMember<T>(render: (member: Member) => T | Promise<T>): Promise<T> {
  const member = await requestMember();
  if (!member) redirect("/connexion");
  return runAs(member, () => render(member));
}

/** Pages réservées à Bastien. */
export async function asAdmin<T>(render: (member: Member) => T | Promise<T>): Promise<T> {
  return asMember((member) => {
    if (member.role !== "admin") redirect("/");
    return render(member);
  });
}

/** Point d'entrée d'une route d'API : 401 sans session, sinon exécution sous le profil. */
export async function apiAsMember(handler: (member: Member) => Response | Promise<Response>): Promise<Response> {
  const member = await requestMember();
  if (!member) return NextResponse.json({ error: "Session expirée : reconnecte-toi." }, { status: 401 });
  return runAs(member, () => handler(member));
}

/** Routes réservées à Bastien (banc, bilan Opus, choix du modèle, profils, retours de tous). */
export async function apiAsAdmin(handler: (member: Member) => Response | Promise<Response>): Promise<Response> {
  return apiAsMember((member) => (member.role === "admin" ? handler(member) : NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 })));
}
