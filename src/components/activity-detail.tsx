"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, BarChart3, Sparkles, Timer } from "lucide-react";
import Link from "next/link";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NormalizedStreams } from "@/lib/db/contracts";
import type { Activity, Lap } from "@/lib/intervals/schemas";
import { formatDate, formatDistance, formatDuration, formatPace } from "@/lib/formatters";
import { segmentActivity, type SegmentationStrategy } from "@/lib/analysis/segmentation";

type Detail = { activity: Activity; intervals: Lap[]; dataAvailability: { intervals: boolean }; sourceMetadata: { cacheStatus: string; fetchedAt: string; sourceUpdatedAt: string | null } };
type Tab = "summary" | "intervals" | "charts";
type Analysis = {
  key_takeaways: string[];
  summary: string;
  observed_facts: string[];
  historical_comparison: string | null;
  zone_classification_summary: string;
  technical_recommendations: string[];
  next_session_pace_guidance: { recommendedPaceMps: number | null; recommendedPaceDisplay: string; rationale: string; adjustments: string[] } | null;
  hypotheses: string[];
  limitations: string[];
  questions_to_consider: string[];
  next_steps: string[];
  safety_note: string | null;
};
type AnalysisPayload = { id: string; analysis: Analysis; model: string; promptVersion: string; createdAt: string };
type ActivityContext = { sessionGoal: string | null; perceivedExertion: string | null; unusualFatigue: number; painFlag: number; note: string | null };

const emptyContext: ActivityContext = { sessionGoal: "", perceivedExertion: "", unusualFatigue: 0, painFlag: 0, note: "" };

export function ActivityDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail>();
  const [streams, setStreams] = useState<NormalizedStreams>();
  const [tab, setTab] = useState<Tab>("summary");
  const [strategy, setStrategy] = useState<SegmentationStrategy>("lap");
  const [error, setError] = useState<string>();
  const [streamError, setStreamError] = useState<string>();
  const [analysis, setAnalysis] = useState<AnalysisPayload>();
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string>();
  const [context, setContext] = useState<ActivityContext>(emptyContext);
  const [contextMessage, setContextMessage] = useState<string>();
  const [contextSaving, setContextSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/activities/${encodeURIComponent(id)}`).then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error((payload as { error?: { message?: string } }).error?.message ?? "Erreur de chargement");
      return payload as Detail;
    }).then(setDetail).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Erreur de chargement"));
    fetch(`/api/activities/${encodeURIComponent(id)}/analysis`).then(async (response) => response.ok ? response.json() as Promise<AnalysisPayload> : undefined).then((payload) => { if (payload) setAnalysis(payload); });
    fetch(`/api/activities/${encodeURIComponent(id)}/context`).then(async (response) => response.ok ? response.json() as Promise<ActivityContext | null> : null).then((payload) => { if (payload) setContext(payload); });
  }, [id]);

  useEffect(() => {
    if (tab !== "charts" || streams) return;
    fetch(`/api/activities/${encodeURIComponent(id)}/streams`).then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("Les courbes ne sont pas disponibles.");
      return payload as NormalizedStreams;
    }).then(setStreams).catch((loadError: unknown) => setStreamError(loadError instanceof Error ? loadError.message : "Les courbes ne sont pas disponibles."));
  }, [id, tab, streams]);

  async function saveContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContextSaving(true);
    setContextMessage(undefined);
    try {
      const response = await fetch(`/api/activities/${encodeURIComponent(id)}/context`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context) });
      if (!response.ok) throw new Error("Le contexte n’a pas pu être enregistré.");
      setContextMessage("Contexte enregistré.");
    } catch (saveError) {
      setContextMessage(saveError instanceof Error ? saveError.message : "Erreur d’enregistrement.");
    } finally {
      setContextSaving(false);
    }
  }

  async function runAnalysis() {
    setAnalysisLoading(true);
    setAnalysisError(undefined);
    try {
      const response = await fetch(`/api/activities/${encodeURIComponent(id)}/analysis`, { method: "POST" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error((payload as { error?: { message?: string } }).error?.message ?? "L’analyse n’a pas pu être générée.");
      setAnalysis(payload as AnalysisPayload);
    } catch (runError) {
      setAnalysisError(runError instanceof Error ? runError.message : "L’analyse n’a pas pu être générée.");
    } finally {
      setAnalysisLoading(false);
    }
  }

  if (error) return <main className="shell"><Link className="back-link" href="/"><ArrowLeft size={16} /> Toutes les activités</Link><section className="panel state error"><strong>Cette activité ne peut pas être chargée.</strong><p>{error}</p></section></main>;
  if (!detail) return <main className="shell"><Link className="back-link" href="/"><ArrowLeft size={16} /> Toutes les activités</Link><section className="panel state"><span className="spinner" />Chargement de la séance...</section></main>;

  const { activity, intervals } = detail;
  const segmented = segmentActivity({ laps: intervals, streams }, strategy);
  return <main className="shell">
    <Link className="back-link" href="/"><ArrowLeft size={16} /> Toutes les activités</Link>
    <section className="detail-head"><div><p className="kicker">{formatDate(activity.start_date_local ?? activity.start_date)} · {activity.type}</p><h1>{activity.name}</h1></div><span className="detail-mark"><Timer size={19} /> {detail.sourceMetadata.cacheStatus === "fresh" ? "Cache récent" : "Données source"}</span></section>
    <div className="summary-grid"><Summary label="Distance" value={formatDistance(activity.distance)} /><Summary label="Durée" value={formatDuration(activity.moving_time ?? activity.elapsed_time)} /><Summary label="Allure moyenne" value={formatPace(activity.average_speed)} /><Summary label="FC moyenne" value={activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "—"} /></div>
    <div className="analysis-action"><div><p className="kicker">Débrief assisté</p><p className="data-note">L’analyse est déclenchée uniquement à votre demande.</p></div><button className="button" onClick={runAnalysis} disabled={analysisLoading}><Sparkles size={16} /> {analysisLoading ? "Analyse en cours..." : analysis ? "Régénérer l’analyse" : "Analyser cette séance"}</button></div>
    {analysisError && <section className="panel state error"><strong>L’analyse est indisponible.</strong><p>{analysisError}</p></section>}
    <nav className="detail-tabs" aria-label="Détail de l’activité">{([['summary', 'Résumé'], ['intervals', 'Intervalles'], ['charts', 'Courbes']] as const).map(([key, label]) => <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === "summary" && <section className="panel laps-panel"><p className="kicker">Données disponibles</p><h2>Résumé de la séance</h2><p className="data-note">Métadonnées et intervalles chargés depuis Intervals.icu. Les constats IA apparaissent après analyse explicite.</p></section>}
    {tab === "intervals" && <section className="panel laps-panel"><div className="section-heading"><div><p className="kicker">Découpage descriptif</p><h2>Intervalles</h2></div><select value={strategy} onChange={(event) => setStrategy(event.target.value as SegmentationStrategy)}><option value="lap">Laps</option><option value="thirds">Tiers</option><option value="adaptive">Adaptatif</option></select></div>{segmented.segments.length === 0 ? <div className="empty-row">Aucun intervalle disponible.</div> : <div className="table-wrap"><table><thead><tr><th>Segment</th><th>Temps</th><th>Distance</th><th>Allure</th><th>FC</th></tr></thead><tbody>{segmented.segments.map((segment) => <tr key={segment.lapId}><th>{segment.index + 1}</th><td>{formatDuration(segment.durationS)}</td><td>{formatDistance(segment.distanceM)}</td><td>{formatPace(segment.averageSpeedMps)}</td><td>{segment.averageHeartRateBpm ? `${Math.round(segment.averageHeartRateBpm)} bpm` : "—"}</td></tr>)}</tbody></table></div>}</section>}
    {tab === "charts" && <StreamsPanel streams={streams} error={streamError} />}
    <ContextForm context={context} setContext={setContext} onSubmit={saveContext} saving={contextSaving} message={contextMessage} />
    {analysis && <AnalysisPanel payload={analysis} />}
  </main>;
}

function ContextForm({ context, setContext, onSubmit, saving, message }: { context: ActivityContext; setContext: (value: ActivityContext) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; message?: string }) {
  return <section className="panel laps-panel context-activity"><div className="section-heading"><div><p className="kicker">Contexte personnel</p><h2>Comment s’est passée la séance ?</h2></div></div><form className="form-grid" onSubmit={onSubmit}><label>Objectif de séance<input value={context.sessionGoal ?? ""} onChange={(event) => setContext({ ...context, sessionGoal: event.target.value })} /></label><label>Effort perçu<select value={context.perceivedExertion ?? ""} onChange={(event) => setContext({ ...context, perceivedExertion: event.target.value })}><option value="">Non renseigné</option><option value="facile">Facile</option><option value="modéré">Modéré</option><option value="difficile">Difficile</option><option value="maximal">Très difficile</option></select></label><label className="preference-row"><input type="checkbox" checked={context.unusualFatigue === 1} onChange={(event) => setContext({ ...context, unusualFatigue: event.target.checked ? 1 : 0 })} /> Fatigue inhabituelle</label><label className="preference-row"><input type="checkbox" checked={context.painFlag === 1} onChange={(event) => setContext({ ...context, painFlag: event.target.checked ? 1 : 0 })} /> Douleur ou gêne signalée</label><label className="wide">Note libre<textarea rows={3} value={context.note ?? ""} onChange={(event) => setContext({ ...context, note: event.target.value })} /></label><div className="form-actions wide"><button className="button" type="submit" disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer le contexte"}</button>{message && <span className="data-note">{message}</span>}</div></form></section>;
}

function AnalysisPanel({ payload }: { payload: AnalysisPayload }) {
  const analysis = payload.analysis;
  return <section className="analysis-panel"><div className="section-heading"><div><p className="kicker"><Sparkles size={14} /> Débrief IA</p><h2>{analysis.summary}</h2></div><span className="detail-mark">{payload.model}</span></div>
    <div className="analysis-block highlight"><h3>Points clés</h3><ul>{analysis.key_takeaways.map((item, index) => <li key={`key-${index}`}>{item}</li>)}</ul></div>
    <AnalysisList title="Recommandations techniques" items={analysis.technical_recommendations} />
    {analysis.next_session_pace_guidance && <div className="analysis-block"><h3>Allure cible pour la prochaine séance similaire</h3><strong>{analysis.next_session_pace_guidance.recommendedPaceDisplay}</strong><p>{analysis.next_session_pace_guidance.rationale}</p><AnalysisList title="Ajustements" items={analysis.next_session_pace_guidance.adjustments} /></div>}
    <div className="analysis-block"><h3>Hypothèses</h3><ul>{analysis.hypotheses.map((item, index) => <li key={`hyp-${index}`}>{item}</li>)}</ul></div>
    <details className="analysis-block"><summary>Voir le détail complet</summary><div className="detail-extra"><AnalysisList title="Constats factuels" items={analysis.observed_facts} /><div className="analysis-block"><h3>Classification en zones</h3><p>{analysis.zone_classification_summary}</p></div><div className="analysis-block"><h3>Comparaison historique</h3><p>{analysis.historical_comparison ?? "Comparaison historique insuffisante."}</p></div><AnalysisList title="Limites et fiabilité" items={analysis.limitations} /><AnalysisList title="Questions à considérer" items={analysis.questions_to_consider} /><AnalysisList title="Prochaines étapes" items={analysis.next_steps} />{analysis.safety_note && <div className="analysis-block safety-note"><h3>Note de sécurité</h3><p>{analysis.safety_note}</p></div>}</div></details>
    <p className="data-note">Source : activité et métriques déterministes calculées. Généré le {new Date(payload.createdAt).toLocaleString("fr-FR")}.</p></section>;
}

function AnalysisList({ title, items }: { title: string; items: string[] }) { return <div className="analysis-block"><h3>{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p className="data-note">Aucun élément fourni.</p>}</div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="summary-item"><small>{label}</small><strong>{value}</strong></div>; }
function StreamsPanel({ streams, error }: { streams?: NormalizedStreams; error?: string }) { if (error) return <section className="panel state error"><BarChart3 size={20} /><strong>{error}</strong><p>Les séries restent facultatives et ne sont pas persistées.</p></section>; if (!streams) return <section className="panel state"><span className="spinner" />Chargement des courbes...</section>; const series = [{ key: "speedMps", label: "Vitesse", unit: "m/s", color: "#f0785f" }, { key: "heartRateBpm", label: "Fréquence cardiaque", unit: "bpm", color: "#5d86a6" }, { key: "cadenceSpm", label: "Cadence", unit: "pas/min", color: "#7c9250" }, { key: "altitudeM", label: "Altitude", unit: "m", color: "#8b6b52" }, { key: "powerW", label: "Puissance", unit: "W", color: "#956ca8" }] as const; const points = streams.elapsedTimeS.map((time, index) => ({ time, ...Object.fromEntries(series.map(({ key }) => [key, streams[key]?.[index] ?? null])) })); return <section className="charts-panel">{series.filter(({ key }) => streams.availability[key === "speedMps" ? "speed" : key === "heartRateBpm" ? "heartRate" : key === "cadenceSpm" ? "cadence" : key === "altitudeM" ? "altitude" : "power"]).map(({ key, label, unit, color }) => <div className="stream-chart" key={key}><div className="section-heading"><h2>{label}</h2><span>{unit}</span></div><ResponsiveContainer width="100%" height={190}><LineChart data={points}><XAxis dataKey="time" tickFormatter={(value) => `${Math.round(value)}s`} /><YAxis unit={` ${unit}`} width={58} /><Tooltip labelFormatter={(value) => `${value}s`} formatter={(value: unknown) => [typeof value === "number" ? value.toFixed(1) : "—", unit]} /><Line type="monotone" dataKey={key} stroke={color} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer></div>)}{!Object.values(streams.availability).some(Boolean) && <p className="data-note">Aucune série graphique disponible.</p>}</section>; }
