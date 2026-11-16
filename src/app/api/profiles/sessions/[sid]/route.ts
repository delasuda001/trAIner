import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/profiles/context";
import { apiAsMember } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ sid: string }> };

/** Révoque un appareil : Bastien pour tous, un invité pour les siens seulement. */
export async function DELETE(_request: Request, { params }: Params) {
  const sid = (await params).sid;
  return apiAsMember((member) => {
    const registry = getRegistry();
    const session = registry.listSessions().find((entry) => entry.id === sid);
    if (!session || (member.role !== "admin" && session.profileId !== member.id)) return NextResponse.json({ error: "Appareil introuvable." }, { status: 404 });
    registry.revokeSession(sid);
    return NextResponse.json({ ok: true });
  });
}
