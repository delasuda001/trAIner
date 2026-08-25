"use client";

import { useEffect, useState } from "react";
import type { ManualSession } from "@/lib/db/types";
import { ManualSessionForm, type ManualSessionFormValue } from "./manual-session-form";
import { ManualSessionItem } from "./manual-session-item";

export function ManualSessionList() {
  const [sessions, setSessions] = useState<ManualSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManualSession>();
  const [error, setError] = useState<string>();
  async function fetchSessions(): Promise<ManualSession[]> { const response = await fetch("/api/manual-sessions"); if (!response.ok) throw new Error("Impossible de charger les activités manuelles."); return await response.json() as ManualSession[]; }
  useEffect(() => { void fetchSessions().then(setSessions).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Erreur de chargement.")).finally(() => setLoading(false)); }, []);
  async function save(value: ManualSessionFormValue) { const response = await fetch(editing ? `/api/manual-sessions/${editing.id}` : "/api/manual-sessions", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }); if (!response.ok) { const payload = await response.json() as { error?: { message?: string } }; throw new Error(payload.error?.message ?? "Impossible d’enregistrer l’activité."); } const saved = await response.json() as ManualSession; setSessions((current) => editing ? current.map((session) => session.id === saved.id ? saved : session) : [saved, ...current]); setEditing(undefined); setFormOpen(false); }
  async function remove(session: ManualSession) { if (!window.confirm("Supprimer cette activité manuelle ?")) return; const response = await fetch(`/api/manual-sessions/${session.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Impossible de supprimer l’activité."); setSessions((current) => current.filter((item) => item.id !== session.id)); }
  return <section className="manual-section"><div className="section-heading"><div><p className="kicker">Calendrier uniquement</p><h2>Activités ajoutées manuellement</h2></div><button className="button" onClick={() => { setEditing(undefined); setFormOpen(true); }}>Ajouter une activité</button></div>{formOpen && <ManualSessionForm initialValue={editing ? { sessionDate: editing.sessionDate, discipline: editing.discipline as ManualSessionFormValue["discipline"], durationMinutes: editing.durationMinutes, label: editing.label ?? undefined, note: editing.note ?? undefined } : undefined} onSubmit={save} onCancel={() => { setEditing(undefined); setFormOpen(false); }} />}{error && <p className="sync-error">{error}</p>}{loading ? <p className="manual-empty">Chargement...</p> : sessions.length === 0 ? <p className="manual-empty">Aucune activité manuelle.</p> : <div className="manual-list">{sessions.map((session) => <ManualSessionItem key={session.id} session={session} onEdit={() => { setEditing(session); setFormOpen(true); }} onDelete={() => void remove(session).catch((removeError: unknown) => setError(removeError instanceof Error ? removeError.message : "Erreur de suppression."))} />)}</div>}</section>;
}