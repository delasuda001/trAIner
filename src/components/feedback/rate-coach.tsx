"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = { subjectKind: "session" | "outlook" | "chat"; subjectId: string; promptVersion?: string | null; label?: string };

/** Pouce haut / bas sur une réponse du coach, avec une note facultative. */
export function RateCoach({ subjectKind, subjectId, promptVersion = null, label = "Utile ?" }: Props) {
  const pathname = usePathname();
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "noting" | "sent">("idle");

  useEffect(() => {
    let alive = true;
    void fetch(`/api/feedback/rating?kind=${subjectKind}&id=${encodeURIComponent(subjectId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { rating: 1 | -1 | null } | null) => { if (alive && json) setRating(json.rating); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [subjectKind, subjectId]);

  async function send(value: 1 | -1, text: string) {
    setRating(value);
    await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: pathname, category: "analyse", rating: value, subjectKind, subjectId, promptVersion, note: text }) });
  }

  return (
    <div className="rate-coach">
      <span className="muted small">{label}</span>
      <button type="button" className={`rate-btn${rating === 1 ? " on" : ""}`} aria-pressed={rating === 1} aria-label="Utile" onClick={() => { void send(1, ""); setState("noting"); }}><ThumbsUp size={14} /></button>
      <button type="button" className={`rate-btn${rating === -1 ? " on" : ""}`} aria-pressed={rating === -1} aria-label="Pas utile" onClick={() => { void send(-1, ""); setState("noting"); }}><ThumbsDown size={14} /></button>
      {state === "noting" && rating ? (
        <form className="rate-note" onSubmit={(event) => { event.preventDefault(); void send(rating, note.trim()).then(() => setState("sent")); }}>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={rating === 1 ? "Qu'est-ce qui t'a servi ? (facultatif)" : "Qu'est-ce qui cloche ? (facultatif)"} maxLength={600} />
          <button type="submit" className="btn btn-ghost">Envoyer</button>
        </form>
      ) : null}
      {state === "sent" ? <span className="muted small">Merci, c&apos;est noté.</span> : null}
    </div>
  );
}
