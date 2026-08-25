"use client";

import { useState } from "react";

export type ManualSessionFormValue = { sessionDate: string; discipline: "strength_training" | "swimming" | "mobility" | "other"; durationMinutes: number; label?: string; note?: string };
type Props = { initialValue?: ManualSessionFormValue; onSubmit: (value: ManualSessionFormValue) => Promise<void>; onCancel: () => void };

function today(): string { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export function ManualSessionForm({ initialValue, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState<ManualSessionFormValue>(initialValue ?? { sessionDate: today(), discipline: "strength_training", durationMinutes: 30 });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(undefined);
    if (!value.sessionDate || !Number.isInteger(value.durationMinutes) || value.durationMinutes < 1 || value.durationMinutes > 720) { setError("Indiquez une date et une durée entre 1 et 720 minutes."); return; }
    if ((value.label?.length ?? 0) > 100 || (value.note?.length ?? 0) > 500) { setError("Le libellé doit faire 100 caractères maximum et la note 500."); return; }
    setSaving(true); try { await onSubmit({ ...value, label: value.label?.trim() || undefined, note: value.note?.trim() || undefined }); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Impossible d’enregistrer l’activité."); } finally { setSaving(false); }
  }
  return <form className="manual-form" onSubmit={submit}><div className="form-grid"><label>Date<input type="date" value={value.sessionDate} onChange={(event) => setValue({ ...value, sessionDate: event.target.value })} required /></label><label>Type<select value={value.discipline} onChange={(event) => setValue({ ...value, discipline: event.target.value as ManualSessionFormValue["discipline"] })}><option value="strength_training">Musculation</option><option value="swimming">Natation</option><option value="mobility">Mobilité</option><option value="other">Autre</option></select></label><label>Durée (min)<input type="number" min="1" max="720" step="1" value={value.durationMinutes} onChange={(event) => setValue({ ...value, durationMinutes: Number(event.target.value) })} required /><span className="quick-values">{[30, 45, 60].map((minutes) => <button type="button" key={minutes} onClick={() => setValue({ ...value, durationMinutes: minutes })}>{minutes}</button>)}</span></label><label>Libellé <span className="optional">facultatif</span><input maxLength={100} value={value.label ?? ""} onChange={(event) => setValue({ ...value, label: event.target.value })} /></label><label className="wide">Note <span className="optional">facultative</span><textarea maxLength={500} rows={2} value={value.note ?? ""} onChange={(event) => setValue({ ...value, note: event.target.value })} /></label></div>{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="quiet-button" onClick={onCancel}>Annuler</button><button className="button" disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</button></div></form>;
}