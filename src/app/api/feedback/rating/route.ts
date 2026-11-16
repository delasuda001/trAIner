import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/profiles/context";
import { apiAsMember } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

/** Pouce déjà donné par le profil connecté sur un sujet (le sien uniquement). */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "";
  const id = params.get("id") ?? "";
  return apiAsMember((member) => NextResponse.json({ rating: kind && id ? getRegistry().ratingOf(member.id, kind, id) : null }));
}
