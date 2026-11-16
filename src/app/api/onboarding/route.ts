import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/profiles/context";
import { apiAsMember } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

/** Fin de l'accueil : on ne le remontre plus (il reste accessible depuis Paramètres). */
export function POST() {
  return apiAsMember((member) => {
    getRegistry().markOnboarded(member.id);
    return NextResponse.json({ ok: true });
  });
}
