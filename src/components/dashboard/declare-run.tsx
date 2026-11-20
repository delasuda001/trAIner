"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSay } from "@/components/ui/register";
import type { DeclaredRun } from "@/lib/declared-runs";
import { formatDate } from "@/lib/formatters";

/**
 * Déclarer une sortie courue sans montre : date et durée. Elle compte dans la régularité et le
 * calendrier, jamais dans les allures ni la charge (aucune donnée mesurée).
 */
export function DeclareRun({ declared, today }: { declared: DeclaredRun[]; today: string }) {
  const say = useSay();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState("40");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(method: "POST" | "DELETE", body: unknown) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/declared-runs", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(json?.error ?? "Impossible pour l'instant.");
      return;
    }
    router.refresh();
  }

  if (!open) return <button type="button" className="link-button declare-open" onClick={() => setOpen(true)}><Plus size={12} /> {say("Une sortie sans ta montre ?", "Une sortie sans votre montre ?")}</button>;
  return (
    <div className="declare-run">
      <p className="small" style={{ margin: 0 }}>{say("Elle comptera dans ta régularité, pas dans tes allures.", "Elle comptera dans votre régularité, pas dans vos allures.")}</p>
      <div className="declare-fields">
        <label className="field"><span>Date</span><input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="field"><span>Durée (min)</span><input inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
        <button type="button" className="btn btn-primary" disabled={busy || !date || !(Number(minutes) >= 5)} onClick={() => void send("POST", { date, durationMin: Math.round(Number(minutes)) })}>Ajouter</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Fermer</button>
      </div>
      {declared.length ? (
        <ul className="declare-list">
          {[...declared].reverse().map((run) => <li key={run.id}>{formatDate(run.date, "short")} · {run.durationMin} min <button type="button" className="btn btn-ghost icon-btn" aria-label="Retirer" disabled={busy} onClick={() => void send("DELETE", { id: run.id })}><X size={12} /></button></li>)}
        </ul>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
