"use client";

import { Check, MessageSquareText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { appendExample, SESSION_NOTE_EXAMPLES } from "@/lib/goal/examples";
import { ExampleChips } from "@/components/ui/example-chips";

type Feeling = { perceivedEffort: number | null; note: string } | null;

/** Ressenti de l'athlète sur la séance : effort perçu et note libre, transmis au coach. */
export function FeelingForm({ activityId, initial }: { activityId: string; initial: Feeling }) {
  const router = useRouter();
  const [effort, setEffort] = useState<number | null>(initial?.perceivedEffort ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = effort !== (initial?.perceivedEffort ?? null) || note !== (initial?.note ?? "");

  async function save() {
    setState("saving");
    const response = await fetch(`/api/activities/${encodeURIComponent(activityId)}/feeling`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ perceivedEffort: effort, note: note.trim() }) });
    setState(response.ok ? "saved" : "error");
    if (response.ok) router.refresh();
  }

  return (
    <section className="card feeling">
      <div className="section-head">
        <h2 className="section-title" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><MessageSquareText size={16} /> Ton ressenti</h2>
        <span className="section-note">transmis au coach à la prochaine analyse</span>
      </div>
      <div className="field">
        <span>Effort perçu (1 = très facile, 10 = maximal)</span>
        <div className="chips">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <button key={value} type="button" className={`chip chip-sm${effort === value ? " selected" : ""}`} onClick={() => { setEffort(effort === value ? null : value); setState("idle"); }}>{value}</button>
          ))}
        </div>
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Contexte</span>
        <textarea rows={3} maxLength={600} value={note} placeholder="Sommeil, météo, terrain, ce que tu voulais tester…" onChange={(event) => { setNote(event.target.value); setState("idle"); }} />
        <ExampleChips examples={SESSION_NOTE_EXAMPLES} onPick={(example) => { setNote((current) => appendExample(current, example, 600)); setState("idle"); }} />
        <small className="muted">Ce que les chiffres ne disent pas : le coach en tient compte pour expliquer la séance.</small>
      </label>
      <div className="form-actions" style={{ marginTop: 12 }}>
        {state === "saved" ? <span className="saved"><Check size={14} /> Enregistré : régénère l&apos;analyse pour que le coach en tienne compte.</span> : null}
        {state === "error" ? <span className="form-error">Enregistrement impossible.</span> : null}
        <button type="button" className="btn btn-primary" disabled={!dirty || state === "saving"} onClick={() => void save()}>{state === "saving" ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </section>
  );
}
