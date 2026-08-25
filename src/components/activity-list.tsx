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
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>();
  const [syncError, setSyncError] = useState<string>();
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
  async function synchronize() {
    setSyncing(true); setSyncMessage(undefined); setSyncError(undefined);
    try {
      const response = await fetch("/api/sync/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const payload: unknown = await response.json();
      if (!response.ok) { const errorPayload = payload as { error?: { message?: string; requestId?: string } }; throw new Error(`${errorPayload.error?.message ?? "La synchronisation a échoué"}${errorPayload.error?.requestId ? ` (référence : ${errorPayload.error.requestId})` : ""}`); }
      const result = payload as { createdCount?: number; updatedCount?: number };
      setSyncMessage(`Synchronisation terminée : ${result.createdCount ?? 0} créées, ${result.updatedCount ?? 0} mises à jour.`);
      await loadActivities();
    } catch (syncLoadError) { setSyncError(syncLoadError instanceof Error ? syncLoadError.message : "La synchronisation a échoué"); }
    finally { setSyncing(false); }
  }
  useEffect(() => { void fetchActivities().then((loadedActivities) => { setActivities(loadedActivities); setState("ready"); }).catch((loadError: unknown) => { setError(loadError instanceof Error ? loadError.message : "FETCH_ERROR"); setState("error"); }); }, []);
  if (state === "loading") return <section className="panel state"><span className="spinner" />Chargement de vos activités...</section>;
  if (state === "error") return <section className="panel state error"><strong>Impossible de charger les activités.</strong><p>{error === "RATE_LIMIT" ? "La limite de requêtes Intervals.icu est atteinte. Réessayez dans quelques instants." : "Vérifiez votre cache local et relancez une synchronisation."}</p><button className="button" onClick={() => void synchronize()} disabled={syncing}><RefreshCw size={16} /> {syncing ? "Synchronisation..." : "Synchroniser"}</button></section>;
  if (activities.length === 0) return <section className="panel state"><strong>Aucune activité synchronisée.</strong><p>Votre cache local est vide. Lancez une synchronisation manuelle pour importer vos courses.</p><button className="button" onClick={() => void synchronize()} disabled={syncing}><RefreshCw size={16} /> {syncing ? "Synchronisation..." : "Synchroniser les activités"}</button>{syncError && <p className="sync-error">{syncError}</p>}</section>;
  return <section className="activities-section"><div className="section-heading"><div><p className="kicker">Cache local · courses uniquement</p><h2>Vos activités</h2></div><button className="button" onClick={() => void synchronize()} disabled={syncing}><RefreshCw size={16} /> {syncing ? "Synchronisation..." : "Synchroniser"}</button></div>{syncMessage && <p className="sync-message">{syncMessage}</p>}{syncError && <p className="sync-error">{syncError}</p>}<div className="activity-grid">{activities.map((activity) => <Link className="activity-card" href={`/activities/${encodeURIComponent(activity.id)}`} key={activity.id}><div className="card-top"><span>{formatDate(activity.start_date_local ?? activity.start_date)}</span><ArrowUpRight size={18} /></div><h3>{activity.name}</h3><span className="sport">{activity.type}</span><div className="metrics"><div><small>DISTANCE</small><strong>{formatDistance(activity.distance)}</strong></div><div><small>DURÉE</small><strong>{formatDuration(activity.moving_time ?? activity.elapsed_time)}</strong></div><div><small>ALLURE</small><strong>{formatPace(activity.average_speed)}</strong></div></div></Link>)}</div></section>;
}