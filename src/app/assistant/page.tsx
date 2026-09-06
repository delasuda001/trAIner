"use client";

import { useState } from "react";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import Link from "next/link";

type Evidence = { activityId: string | null; label: string; value: string };
type ConversationResponse = { summary: string; observedFacts: string[]; comparisons: string[]; hypotheses: string[]; limitations: string[]; missingData: string[]; evidence: Evidence[] };
type DisplayMessage = { role: "user" | "assistant"; text?: string; response?: ConversationResponse };

const suggestions = [
  "Cette séance était-elle cohérente avec mon objectif actuel ?",
  "Comment ma cadence évolue-t-elle sur les sorties faciles ?",
  "Compare cette activité à mes dernières séances similaires.",
  "Quelles données manquent pour évaluer cet objectif ?",
];

export default function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(value = question) {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setQuestion(""); setError(undefined); setLoading(true);
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    try {
      const endpoint = threadId ? `/api/conversations/${threadId}/messages` : "/api/conversations";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed }) });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error((payload as { error?: { message?: string } }).error?.message ?? "L’assistant est indisponible.");
      const data = payload as { threadId: string; response: ConversationResponse };
      setThreadId(data.threadId);
      setMessages((current) => [...current, { role: "assistant", response: data.response }]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "L’assistant est indisponible.");
    } finally { setLoading(false); }
  }

  return <main className="shell assistant-page">
    <Link className="back-link" href="/"><ArrowLeft size={16} /> Tableau de bord</Link>
    <section className="assistant-hero"><p className="kicker">Assistant fondé sur les données</p><h1>Posez une question<br /><em>à vos activités.</em></h1><p className="intro">Chaque réponse sélectionne d’abord un périmètre d’activités, puis expose les faits, comparaisons, hypothèses et limites utilisés.</p></section>
    <section className="assistant-composer panel"><div className="suggestions"><span className="eyebrow">Suggestions</span>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => { setQuestion(suggestion); void submit(suggestion); }}>{suggestion}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); void submit(); }}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex. Compare cette activité à mes dernières séances similaires." rows={3} aria-label="Question à l’assistant" /><button className="button" type="submit" disabled={loading || !question.trim()}><Send size={16} /> {loading ? "Analyse..." : "Envoyer"}</button></form></section>
    {error && <section className="panel state error"><strong>L’assistant est indisponible.</strong><p>{error}</p></section>}
    {messages.length === 0 && !loading && <section className="panel state"><Sparkles size={22} /><strong>Aucune question posée.</strong><p>Choisissez une suggestion ou écrivez une question liée à vos activités et objectifs.</p></section>}
    <section className="conversation-list">{messages.map((message, index) => message.role === "user" ? <div className="conversation-user" key={`user-${index}`}>{message.text}</div> : message.response ? <ResponseBlock key={`assistant-${index}`} response={message.response} /> : null)}{loading && <div className="panel state"><span className="spinner" />Sélection du périmètre et calcul des métriques...</div>}</section>
  </main>;
}

function ResponseBlock({ response }: { response: ConversationResponse }) {
  return <article className="conversation-response"><p className="kicker"><Sparkles size={14} /> Réponse structurée</p><h2>{response.summary}</h2><ResponseList title="Faits observés" items={response.observedFacts} /><ResponseList title="Comparaisons" items={response.comparisons} /><ResponseList title="Hypothèses" items={response.hypotheses} /><ResponseList title="Limites" items={[...response.limitations, ...response.missingData]} />{response.evidence.length > 0 && <div className="assistant-evidence"><h3>Sources utilisées</h3>{response.evidence.map((item, index) => <div key={`${item.activityId ?? "aggregate"}-${index}`}><strong>{item.activityId ?? "Agrégat"}</strong><span>{item.label} : {item.value}</span></div>)}</div>}</article>;
}

function ResponseList({ title, items }: { title: string; items: string[] }) { return <div className="assistant-block"><h3>{title}</h3>{items.length > 0 ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p className="data-note">Aucune donnée fournie.</p>}</div>; }
