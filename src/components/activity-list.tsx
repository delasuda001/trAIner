"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { Activity } from "@/lib/intervals/schemas";
import { formatDate, formatDistance, formatDuration, formatPace } from "@/lib/formatters";

type LoadState = "loading" | "ready" | "error";

export function ActivityList() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string>();
  async function fetchActivities(): Promise<Activity[]> {
    const response = await fetch("/api/activities");
    const payload: unknown = await response.json();
    if (!response.ok || !Array.isArray(payload)) throw new Error(response.status === 429 ? "RATE_LIMIT" : "FETCH_ERROR");
    return payload as Activity[];
  }
  async function loadActivities() {
    setState("loading");
    try {
      setActivities(await fetchActivities()); setState("ready");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "FETCH_ERROR"); setState("error"); }
  }
  useEffect(() => { void fetchActivities().then((loadedActivities) => { setActivities(loadedActivities); setState("ready"); }).catch((loadError: unknown) => { setError(loadError instanceof Error ? loadError.message : "FETCH_ERROR"); setState("error"); }); }, []);
  if (state === "loading") return <section className="panel state"><span className="spinner" />Chargement de vos activités...</section>;
  if (state === "error") return <section className="panel state error"><strong>Impossible de charger les activités.</strong><p>{error === "RATE_LIMIT" ? "La limite de requêtes Intervals.icu est atteinte. Réessayez dans quelques instants." : "Vérifiez vos variables .env.local et la connexion à Intervals.icu."}</p><button className="button" onClick={() => void loadActivities()}><RefreshCw size={16} /> Réessayer</button></section>;
  if (activities.length === 0) return <section className="panel state"><strong>Aucune course récente.</strong><p>Intervals.icu ne renvoie aucune activité de course sur les 90 derniers jours.</p></section>;
  return <section className="activities-section"><div className="section-heading"><div><p className="kicker">Synchronisées récemment</p><h2>Vos activités</h2></div><button className="icon-button" aria-label="Actualiser les activités" title="Actualiser" onClick={() => void loadActivities()}><RefreshCw size={18} /></button></div><div className="activity-grid">{activities.map((activity) => <Link className="activity-card" href={`/activities/${encodeURIComponent(activity.id)}`} key={activity.id}><div className="card-top"><span>{formatDate(activity.start_date_local ?? activity.start_date)}</span><ArrowUpRight size={18} /></div><h3>{activity.name}</h3><span className="sport">{activity.type}</span><div className="metrics"><div><small>DISTANCE</small><strong>{formatDistance(activity.distance)}</strong></div><div><small>DURÉE</small><strong>{formatDuration(activity.moving_time ?? activity.elapsed_time)}</strong></div><div><small>ALLURE</small><strong>{formatPace(activity.average_speed)}</strong></div></div></Link>)}</div></section>;
}