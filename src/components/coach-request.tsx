"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CoachGaugeLine, useCoachGauge } from "@/components/coach/coach-gauge";

type CoachResponse = { status: "ready" | "missing" | "error"; message?: string };

/** Demande explicite d'une analyse à Claude (jamais déclenchée au chargement). */
export function CoachRequest({ endpoint, label, initialError }: { endpoint: string; label: string; initialError?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pressed, setPressed] = useState(false);
  const gauge = useCoachGauge();
  // Coach en pause (abonnement presque plein ou analyses du jour faites) : le bouton attend, sans erreur à lire.
  const paused = gauge?.guest === true && (gauge.level === "plein" || gauge.left === 0);

  async function request() {
    setPressed(true);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const body = (await response.json()) as CoachResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Analyse impossible");
      if (body.status === "error") setError(body.message ?? "Analyse impossible");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analyse impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn" onClick={() => void request()} disabled={busy || paused}>
        <Sparkles size={14} className={busy ? "spin" : undefined} />
        {busy ? "Le coach réfléchit… (10 à 20 s)" : label}
      </button>
      <CoachGaugeLine reveal={pressed} />
      {error && !paused ? <p className="notice notice-error">{error}</p> : null}
    </div>
  );
}
