"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Timer } from "lucide-react";
import Link from "next/link";
import type { Activity, Lap } from "@/lib/intervals/schemas";
import { formatDate, formatDistance, formatDuration, formatPace } from "@/lib/formatters";

type Detail = { activity: Activity; laps: Lap[] };

export function ActivityDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch(`/api/activities/${encodeURIComponent(id)}`)
      .then(async (response) => { const payload: unknown = await response.json(); if (!response.ok) { const errorPayload = payload as { error?: { message?: string; requestId?: string } }; throw new Error(errorPayload.error?.requestId ? `${errorPayload.error.message ?? "Erreur"} (référence : ${errorPayload.error.requestId})` : "FETCH_ERROR"); } return payload as Detail; })
      .then(setDetail)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "FETCH_ERROR"));
  }, [id]);

  if (error) return <main className="shell"><Link className="back-link" href="/"><ArrowLeft size={16} /> Toutes les activités</Link><section className="panel state error"><strong>Cette activité ne peut pas être chargée.</strong><p>{error === "RATE_LIMIT" ? "La limite de requêtes est atteinte. Réessayez plus tard." : "Vérifiez la configuration Intervals.icu ou l’identifiant de l’activité."}</p></section></main>;
  if (!detail) return <main className="shell"><Link className="back-link" href="/"><ArrowLeft size={16} /> Toutes les activités</Link><section className="panel state"><span className="spinner" />Chargement de la séance...</section></main>;

  const { activity, laps } = detail;
  return <main className="shell"><Link className="back-link" href="/"><ArrowLeft size={16} /> Toutes les activités</Link><section className="detail-head"><div><p className="kicker">{formatDate(activity.start_date_local ?? activity.start_date)} · {activity.type}</p><h1>{activity.name}</h1></div><span className="detail-mark"><Timer size={19} /> Données brutes</span></section><div className="summary-grid"><Summary label="Distance" value={formatDistance(activity.distance)} /><Summary label="Durée" value={formatDuration(activity.moving_time ?? activity.elapsed_time)} /><Summary label="Allure moyenne" value={formatPace(activity.average_speed)} /><Summary label="FC moyenne" value={activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "—"} /></div><section className="panel laps-panel"><div className="section-heading"><div><p className="kicker">Découpage de la séance</p><h2>Laps & intervalles</h2></div><span className="count">{laps.length} {laps.length > 1 ? "laps" : "lap"}</span></div>{laps.length === 0 ? <div className="empty-row">Aucun lap disponible pour cette activité.</div> : <div className="table-wrap"><table><thead><tr><th>Lap</th><th>Distance</th><th>Durée</th><th>Allure</th><th>FC moy.</th><th>Cadence</th></tr></thead><tbody>{laps.map((lap, index) => <tr key={String(lap.id ?? index)}><th>{lap.name ?? `Lap ${index + 1}`}</th><td>{formatDistance(lap.distance)}</td><td>{formatDuration(lap.moving_time ?? lap.elapsed_time)}</td><td>{formatPace(lap.average_speed)}</td><td>{lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : "—"}</td><td>{lap.average_cadence ? `${Math.round(lap.average_cadence)} pas/min` : "—"}</td></tr>)}</tbody></table></div>}</section></main>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="summary-item"><small>{label}</small><strong>{value}</strong></div>; }