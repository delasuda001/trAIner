import { NextResponse } from "next/server";
import { apiAsMember } from "@/lib/profiles/request";
import { clearWeekConstraint } from "@/lib/server/week-constraint";

export const dynamic = "force-dynamic";

/** Retire la contrainte de la semaine : la proposition de séance redevient celle du plan habituel. */
export function DELETE() {
  return apiAsMember(() => {
    clearWeekConstraint();
    return NextResponse.json({ ok: true });
  });
}
