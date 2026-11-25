"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CoachGaugeLine, QuotaMeter, useLocalTime } from "./coach-gauge";
import { ArrowUp, Ban, CalendarClock, Clock, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { generatedAtLabel, modelLabel } from "@/lib/coach/model-label";
import { RateCoach } from "@/components/feedback/rate-coach";
import type { ChatMessage } from "@/lib/db/repositories/chat-repository";
import { useSay } from "@/components/ui/register";
import { useConnection } from "@/components/offline/connection";
import { reachable } from "@/lib/offline/queue";

const SUGGESTIONS = [
  "Est-ce que je suis bien le plan cette semaine ?",
  "Pourquoi cette séance plutôt qu'un fractionné ?",
  "Mes répétitions sont plus lentes à FC égale, qu'est-ce que ça veut dire ?",
  "Je ne peux courir qu'une fois cette semaine, laquelle faire ?",
  "Comment progresser vers mon objectif avec 2 sorties par semaine ?",
]; 

export type ChatSession = { id: string; date: string; title: string };

/** Séances qui semblent correspondre à la question (date ou type cités) : proposées en premier. */
function matches(question: string, session: ChatSession): boolean {
  const text = question.toLowerCase();
  const day = /^(\d{1,2})/.exec(session.date)?.[1];
  const month = session.date.split(" ")[1]?.replace(".", "").toLowerCase();
  const dated = day != null && month != null && new RegExp(`\\b${day}\\s*${month.slice(0, 3)}`).test(text);
  const typed = session.title.toLowerCase().split(/[\s:×]+/).some((word) => word.length > 4 && text.includes(word));
  return dated || typed;
}

export function CoachChat({ initial, seen, sessions = [], preselected = null }: { initial: ChatMessage[]; seen: string[]; sessions?: ChatSession[]; preselected?: string | null }) {
  const say = useSay();
  const connection = useConnection();
  const offline = connection.status === "offline";
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [chosen, setChosen] = useState<string | null>(preselected);
  const [allSessions, setAllSessions] = useState(false);
  // Question refusée par le quota : elle reste affichée (non envoyée) avec la raison, et revient dans le champ.
  const [refused, setRefused] = useState<{ question: string; message: string; freesAt: string | null } | null>(null);
  const freesAt = useLocalTime(refused?.freesAt ?? null);
  const ordered = [...sessions].sort((a, b) => Number(matches(question, b)) - Number(matches(question, a)));
  const shownSessions = allSessions ? ordered : ordered.slice(0, 6);
  const chosenSession = sessions.find((session) => session.id === chosen) ?? null;
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);

  // Corps entre accolades : dans les navigateurs récents, scrollIntoView renvoie une promesse, que React
  // prendrait pour la fonction de nettoyage de l'effet (« i is not a function » au message suivant).
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, refused]);

  async function ask(text: string) {
    const value = text.trim();
    if (value.length < 2 || busy) return;
    if (offline) {
      if (connection.add({ kind: "chat", question: value })) setQuestion("");
      return;
    }
    setAsked(true);
    setRefused(null);
    setBusy(true);
    setQuestion("");
    setMessages((current) => [...current, { id: `pending-${Date.now()}`, role: "user", content: { text: value, ...(chosenSession ? { activity: { id: chosenSession.id, label: `${chosenSession.title} · ${chosenSession.date}` } } : {}) }, model: null, createdAt: new Date().toISOString() }]);
    try {
      let response: Response;
      try {
        response = await fetch("/api/coach/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value, activityId: chosen }) });
      } catch {
        response = new Response(null, { status: 503 });
      }
      if (!reachable(response.status)) {
        // Mac éteint : la question part en file d'attente au lieu d'être perdue.
        setMessages((current) => current.filter((message) => !message.id.startsWith("pending-")));
        connection.markOffline();
        connection.add({ kind: "chat", question: value });
        return;
      }
      const body = (await response.json()) as { messages?: ChatMessage[]; error?: { kind: string; message: string; freesAt?: string | null } | string };
      if (body.messages) setMessages(body.messages);
      if (typeof body.error === "object" && body.error?.kind === "quota") {
        setRefused({ question: value, message: body.error.message, freesAt: body.error.freesAt ?? null });
        setQuestion((current) => current || value);
      }
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
            <p className="muted">{say("Pose une question sur ton entraînement, ou préviens-le d'une contrainte (fatigue, semaine chargée, voyage…). Des idées sont à droite.", "Posez une question sur votre entraînement, ou signalez-lui une contrainte (fatigue, semaine chargée, voyage…). Des idées sont à droite.")}</p>
          </div>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={`bubble ${message.role}${message.content.error ? " error" : ""}`}>
            {message.content.activity ? <span className="chat-about">{message.content.activity.label}</span> : null}
            <p style={{ whiteSpace: "pre-wrap" }}>{message.content.text}</p>
            {message.content.planNote ? <Link href="/" className="plan-note"><CalendarClock size={13} /> {message.content.planNote} Voir l&apos;accueil</Link> : null}
            {message.content.evidence?.length ? <ul className="evidence">{message.content.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            {message.role === "coach" && message.model ? <span className="coach-stamp"><Sparkles size={12} /> {modelLabel(message.model)} · {generatedAtLabel(message.createdAt)}</span> : null}
            {message.role === "coach" && message.model && !message.content.error ? <RateCoach subjectKind="chat" subjectId={message.id} label="Utile ?" /> : null}
          </div>
        ))}
        {refused ? (
          <>
            <div className="bubble user refused">
              <p style={{ whiteSpace: "pre-wrap" }}>{refused.question}</p>
              <span className="coach-stamp"><Ban size={12} /> Non envoyée</span>
            </div>
            <div className="bubble coach notice-quota" role="alert">
              <strong>Ta question n&apos;est pas partie au coach.</strong>
              <p>{refused.message}</p>
              {freesAt ? <p className="small">Possible de nouveau {freesAt}. Ta question est gardée dans le champ ci-dessous.</p> : <p className="small">Ta question est gardée dans le champ ci-dessous.</p>}
            </div>
          </>
        ) : null}
        {connection.queue.flatMap((item) => (item.kind === "chat" ? [item] : [])).map((item) => (
          <div key={item.id} className="bubble user queued">
            <p style={{ whiteSpace: "pre-wrap" }}>{item.question}</p>
            <span className="coach-stamp"><Clock size={12} /> En file : partira au retour du Mac de Bastien</span>
          </div>
        ))}
        {busy ? <div className="bubble coach"><span className="muted"><Sparkles size={13} className="spin" /> {say("Le coach regarde tes données… (10 à 20 s)", "Le coach examine vos données… (10 à 20 s)")}</span></div> : null}
        <div ref={end} />
      </div>
      {sessions.length ? (
        <div className="chat-sessions">
          <span className="muted small">{chosenSession ? say("Question sur :", "Question sur :") : say("À propos d'une séance ? (facultatif)", "À propos d'une séance ? (facultatif)")}</span>
          <div className="chips">
            {shownSessions.map((session) => {
              const selected = session.id === chosen;
              const hint = !selected && question.trim().length > 3 && matches(question, session);
              return <button key={session.id} type="button" className={`chip chip-small${selected ? " selected" : ""}${hint ? " chip-hint" : ""}`} aria-pressed={selected} onClick={() => setChosen(selected ? null : session.id)}>{session.date} · {session.title}</button>;
            })}
            {sessions.length > 6 ? <button type="button" className="chip chip-small chip-example" onClick={() => setAllSessions((value) => !value)}>{allSessions ? "Moins" : `+ ${sessions.length - 6}`}</button> : null}
          </div>
        </div>
      ) : null}
      <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <textarea rows={2} maxLength={800} value={question} placeholder={say("Ta question au coach…", "Votre question au coach…")} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(question); } }} />
        <button type="submit" className="btn btn-primary icon-btn" disabled={busy || question.trim().length < 2} aria-label="Envoyer"><ArrowUp size={16} /></button>
      </form>
      {offline ? <p className="muted small" style={{ marginTop: 6 }}><Clock size={12} /> {say("Hors ligne : ta question sera mise en file et partira au retour du Mac.", "Hors ligne : votre question sera mise en file et partira au retour du Mac.")}</p> : null}
      <QuotaMeter />
      <CoachGaugeLine reveal={asked} />
      <div className="row-between" style={{ marginTop: 8, alignItems: "center" }}>
        <span className="muted small">{say("Le coach voit les 6 derniers messages et un résumé de tes données, pas tes séries brutes.", "Le coach voit les 6 derniers messages et un résumé de vos données, pas vos séries brutes.")}</span>
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
        <p className="muted small" style={{ marginTop: 8 }}>{say("Ajoute ton ressenti sur une séance pour qu'il en tienne compte.", "Ajoutez votre ressenti sur une séance pour qu'il en tienne compte.")}</p>
      </section>
    </aside>
    </div>
  );
}
