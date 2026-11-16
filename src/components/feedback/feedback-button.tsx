"use client";

import { MessageSquarePlus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

const CATEGORIES = [
  { value: "idee", label: "Une idée" },
  { value: "besoin", label: "Un besoin" },
  { value: "bug", label: "Ça ne marche pas" },
  { value: "donnees", label: "Mes données" },
  { value: "analyse", label: "Le coach" },
  { value: "autre", label: "Autre" },
] as const;

/** Bouton « Un retour ? » présent sur toutes les pages : note libre, page jointe automatiquement. */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("idee");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const activity = pathname.startsWith("/activities/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : null;
    const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: pathname, category, rating: null, subjectKind: activity ? "session" : "page", subjectId: activity, promptVersion: null, note: note.trim() }) });
    setState(response.ok ? "sent" : "error");
    if (response.ok) setNote("");
  }

  if (!open) {
    return (
      <button type="button" className="feedback-fab" onClick={() => { setOpen(true); setState("idle"); }} aria-label="Faire un retour sur cette page">
        <MessageSquarePlus size={18} /> <span>Un retour ?</span>
      </button>
    );
  }
  return (
    <div className="feedback-panel card" role="dialog" aria-label="Faire un retour">
      <div className="row-between">
        <strong>Ton avis sur cette page</strong>
        <button type="button" className="btn btn-ghost icon-btn" onClick={() => setOpen(false)} aria-label="Fermer"><X size={16} /></button>
      </div>
      {state === "sent" ? (
        <>
          <p className="small">Merci ! Bastien le lira. Tu peux en écrire un autre quand tu veux.</p>
          <button type="button" className="btn" onClick={() => setState("idle")}>Écrire un autre retour</button>
        </>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="stack" style={{ gap: 10 }}>
          <div className="chips">
            {CATEGORIES.map((entry) => (
              <button key={entry.value} type="button" className={`chip chip-small${category === entry.value ? " selected" : ""}`} onClick={() => setCategory(entry.value)}>{entry.label}</button>
            ))}
          </div>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={2000} placeholder="Ce qui t'aiderait, ce qui manque, ce qui est confus…" required />
          {state === "error" ? <p className="form-error">Envoi impossible, réessaie.</p> : null}
          <button type="submit" className="btn btn-primary" disabled={state === "sending" || note.trim().length < 2}>{state === "sending" ? "Envoi…" : "Envoyer"}</button>
        </form>
      )}
    </div>
  );
}
