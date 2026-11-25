"use client";

import { CalendarClock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Contrainte de la semaine dite au coach, rappelée sur la carte prochaine séance, et retirable. */
export function WeekConstraintNote({ text }: { text: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    await fetch("/api/week-constraint", { method: "DELETE" }).catch(() => null);
    router.refresh();
    setBusy(false);
  }
  return (
    <p className="week-constraint">
      <CalendarClock size={13} aria-hidden />
      <span>{text}</span>
      <button type="button" className="btn btn-ghost icon-btn" disabled={busy} onClick={() => void remove()} aria-label="Retirer la contrainte de la semaine" title="Retirer : revenir au plan habituel"><X size={13} /></button>
    </p>
  );
}
