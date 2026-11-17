"use client";

import { useRouter } from "next/navigation";
import { CoachGaugeLine } from "./coach-gauge";
import { ArrowUp, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { generatedAtLabel, modelLabel } from "@/lib/coach/model-label";
import { RateCoach } from "@/components/feedback/rate-coach";
import type { ChatMessage } from "@/lib/db/repositories/chat-repository";

const SUGGESTIONS = [
  "Est-ce que je suis bien le plan cette semaine ?",
  "Pourquoi cette séance plutôt qu'un fractionné ?",
  "Mes répétitions sont plus lentes à FC égale, qu'est-ce que ça veut dire ?",
  "Je ne peux courir qu'une fois cette semaine, laquelle faire ?",
  "Comment progresser vers mon objectif avec 2 sorties par semaine ?",
]; 

export function CoachChat({ initial, seen }: { initial: ChatMessage[]; seen: string[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, busy]);

  async function ask(text: string) {
    const value = text.trim();
    if (value.length < 2 || busy) return;
    setAsked(true);
    setBusy(true);
    setQuestion("");
    setMessages((current) => [...current, { id: `pending-${Date.now()}`, role: "user", content: { text: value }, model: null, createdAt: new Date().toISOString() }]);
    try {
      const response = await fetch("/api/coach/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value }) });
      const body = (await response.json()) as { messages?: ChatMessage[]; error?: string };
      if (body.messages) setMessages(body.messages);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await fetch("/api/coach/chat", { method: "DELETE" });
    setMessages([]);
  }

  return (
    <div className="chat-layout">
    <section className="card chat">
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p className="muted">Pose une question sur ton entraînement, ou préviens-le d&apos;une contrainte (fatigue, semaine chargée, voyage…). Des idées sont à droite.</p>
          </div>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={`bubble ${message.role}${message.content.error ? " error" : ""}`}>
            <p style={{ whiteSpace: "pre-wrap" }}>{message.content.text}</p>
            {message.content.evidence?.length ? <ul className="evidence">{message.content.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            {message.role === "coach" && message.model ? <span className="coach-stamp"><Sparkles size={12} /> {modelLabel(message.model)} · {generatedAtLabel(message.createdAt)}</span> : null}
            {message.role === "coach" && message.model && !message.content.error ? <RateCoach subjectKind="chat" subjectId={message.id} label="Utile ?" /> : null}
          </div>
        ))}
        {busy ? <div className="bubble coach"><span className="muted"><Sparkles size={13} className="spin" /> Le coach regarde tes données… (10 à 20 s)</span></div> : null}
        <div ref={end} />
      </div>
      <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <textarea rows={2} maxLength={800} value={question} placeholder="Ta question au coach…" onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(question); } }} />
        <button type="submit" className="btn btn-primary icon-btn" disabled={busy || question.trim().length < 2} aria-label="Envoyer"><ArrowUp size={16} /></button>
      </form>
      <CoachGaugeLine reveal={asked} />
      <div className="row-between" style={{ marginTop: 8, alignItems: "center" }}>
        <span className="muted small">Le coach voit les 6 derniers messages et un résumé de tes données, pas tes séries brutes.</span>
        {messages.length ? <button type="button" className="btn btn-ghost" onClick={() => void clear()}><Trash2 size={13} /> Effacer</button> : null}
      </div>
    </section>
    <aside className="stack">
      <section className="card">
        <h2 className="section-title">Idées de questions</h2>
        <div className="suggestion-list">
          {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" className="suggestion" disabled={busy} onClick={() => void ask(suggestion)}>{suggestion}</button>)}
        </div>
      </section>
      <section className="card">
        <h2 className="section-title">Ce que le coach a sous les yeux</h2>
        <ul className="seen-list">{seen.map((item) => <li key={item}>{item}</li>)}</ul>
        <p className="muted small" style={{ marginTop: 8 }}>Ajoute ton ressenti sur une séance pour qu&apos;il en tienne compte.</p>
      </section>
    </aside>
    </div>
  );
}
