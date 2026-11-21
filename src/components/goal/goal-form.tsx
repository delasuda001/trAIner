"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RACE_DISTANCES, WEEKDAY_LABELS, type Goal } from "@/lib/goal/goal";
import { appendExample, CONTEXT_EXAMPLES, GOAL_EXAMPLES } from "@/lib/goal/examples";
import { ExampleChips } from "@/components/ui/example-chips";
import { useSay } from "@/components/ui/register";

const DISTANCES = RACE_DISTANCES;

function parseTime(text: string): number | null {
  const parts = text.trim().split(":").map(Number);
  if (!text.trim() || parts.some((part) => Number.isNaN(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0) || null;
}

function formatTime(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function paceText(distanceKm: number | null, seconds: number | null): string | null {
  if (!distanceKm || !seconds) return null;
  const perKm = Math.round(seconds / distanceKm);
  return `${Math.floor(perKm / 60)}:${String(perKm % 60).padStart(2, "0")}/km`;
}

export function GoalForm({ initial }: { initial: Goal }) {
  const say = useSay();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal>(initial);
  const [time, setTime] = useState(formatTime(initial.targetTimeS));
  // Objectifs chiffrés par distance (texte saisi, converti à l'enregistrement).
  const [raceTimes, setRaceTimes] = useState<Record<string, string>>(() => Object.fromEntries(RACE_DISTANCES.map((race) => [race.label, formatTime(initial.raceTargets.find((target) => Math.abs(target.distanceKm - race.value) < 0.05)?.targetTimeS ?? null)])));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const update = (changes: Partial<Goal>) => {
    setGoal((current) => ({ ...current, ...changes }));
    setState("idle");
  };
  const targetTimeS = parseTime(time);
  const pace = paceText(goal.distanceKm, targetTimeS);
  const raceTargets = RACE_DISTANCES.flatMap((race) => {
    const seconds = parseTime(raceTimes[race.label] ?? "");
    return seconds ? [{ distanceKm: race.value, targetTimeS: Math.round(seconds) }] : [];
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const response = await fetch("/api/goal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...goal, targetTimeS: targetTimeS ? Math.round(targetTimeS) : null, raceTargets }) });
    setState(response.ok ? "saved" : "error");
    if (response.ok) router.refresh();
  }

  return (
    <form className="card goal-form" onSubmit={(event) => void save(event)}>
      <div className="form-grid">
        <label className="field wide">
          <span>Objectif</span>
          <input value={goal.title} maxLength={100} placeholder="ex. Marathon de Paris sous 3:30, ou « courir plus facilement »" onChange={(event) => update({ title: event.target.value })} />
          <ExampleChips label={say("Pour t'inspirer", "Pour vous inspirer")} examples={GOAL_EXAMPLES.map((example) => example.label)} onPick={(label) => {
            const example = GOAL_EXAMPLES.find((entry) => entry.label === label);
            if (!example) return;
            update({ title: example.title, ...(example.distanceKm ? { distanceKm: example.distanceKm } : {}) });
            if (example.time) setTime(example.time);
          }} />
          <small className="muted">{say("Une course, un temps, ou simplement une envie. Facultatif : sans objectif, le coach s'appuie sur tes propres repères.", "Une course, un temps, ou simplement une envie. Facultatif : sans objectif, le coach s'appuie sur vos propres repères.")}</small>
        </label>
        <label className="field">
          <span>Date de la course</span>
          <input type="date" value={goal.eventDate ?? ""} onChange={(event) => update({ eventDate: event.target.value || null })} />
        </label>
        <div className="field">
          <span>Distance</span>
          <div className="chips">
            {DISTANCES.map((distance) => (
              <button key={distance.label} type="button" className={`chip${goal.distanceKm === distance.value ? " selected" : ""}`} onClick={() => update({ distanceKm: goal.distanceKm === distance.value ? null : distance.value })}>{distance.label}</button>
            ))}
            <input className="chip-input" type="number" min={1} max={250} step={0.1} placeholder="autre km" value={goal.distanceKm && !DISTANCES.some((distance) => distance.value === goal.distanceKm) ? goal.distanceKm : ""} onChange={(event) => update({ distanceKm: event.target.value ? Number(event.target.value) : null })} />
          </div>
        </div>
        <label className="field">
          <span>Temps visé</span>
          <input value={time} placeholder="43:00 ou 1:35:00" onChange={(event) => { setTime(event.target.value); setState("idle"); }} />
          <small className="muted">{pace ? `Soit ${pace}` : "Facultatif"}</small>
        </label>
        <div className="field">
          <span>Sorties par semaine possibles</span>
          <div className="chips">
            {[1, 2, 3, 4].map((count) => (
              <button key={count} type="button" className={`chip${goal.runsPerWeek === count ? " selected" : ""}`} onClick={() => update({ runsPerWeek: count })}>{count}</button>
            ))}
          </div>
        </div>
        <div className="field wide">
          <span>{say("Jours où tu peux courir", "Jours où vous pouvez courir")}</span>
          <div className="chips">
            {WEEKDAY_LABELS.map((label, day) => (
              <button key={label} type="button" className={`chip${goal.preferredDays.includes(day) ? " selected" : ""}`} onClick={() => update({ preferredDays: goal.preferredDays.includes(day) ? goal.preferredDays.filter((value) => value !== day) : [...goal.preferredDays, day].sort() })}>{label.slice(0, 3)}</button>
            ))}
          </div>
        </div>
        <div className="field wide">
          <span>Objectifs chiffrés</span>
          <div className="chips">
            {RACE_DISTANCES.map((race) => {
              const value = raceTimes[race.label] ?? "";
              const racePace = paceText(race.value, parseTime(value));
              return (
                <label key={race.label} className="chip-input-group">
                  <small className="muted">{race.label}</small>
                  <input className="chip-input" value={value} placeholder={race.value >= 42 ? "3:45:00" : race.value >= 21 ? "1:45:00" : race.value >= 10 ? "48:00" : "23:00"} onChange={(event) => { setRaceTimes((current) => ({ ...current, [race.label]: event.target.value })); setState("idle"); }} />
                  {racePace ? <small className="muted">{racePace}</small> : null}
                </label>
              );
            })}
          </div>
          <small className="muted">{say("Le coach s'en sert pour fixer les allures cibles des séances et te dire si l'objectif est à portée.", "Le coach s'en sert pour fixer les allures cibles des séances et vous dire si l'objectif est à portée.")}</small>
        </div>
        <label className="field wide">
          <span>À savoir pour le coach</span>
          <textarea rows={2} maxLength={300} value={goal.note} placeholder="ex. sortie longue plutôt le dimanche, terrain vallonné" onChange={(event) => update({ note: event.target.value })} />
          <ExampleChips examples={CONTEXT_EXAMPLES} onPick={(example) => update({ note: appendExample(goal.note, example, 300) })} />
          <small className="muted">{say("Tes habitudes et contraintes : le coach s'en sert pour placer et doser tes séances.", "Vos habitudes et contraintes : le coach s'en sert pour placer et doser vos séances.")}</small>
        </label>
      </div>
      <div className="form-actions">
        {state === "saved" ? <span className="saved"><Check size={14} /> Enregistré : la suggestion en tient compte.</span> : null}
        {state === "error" ? <span className="form-error">Enregistrement impossible, vérifie le temps visé (format 43:00).</span> : null}
        <button type="submit" className="btn btn-primary" disabled={state === "saving"}>{state === "saving" ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </form>
  );
}
