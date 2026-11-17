"use client";

import { Clock, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CoachGaugeLine, useCoachGauge } from "@/components/coach/coach-gauge";
import { useConnection } from "@/components/offline/connection";
import { useSay } from "@/components/ui/register";
import { reachable } from "@/lib/offline/queue";

type CoachResponse = { status: "ready" | "missing" | "error"; message?: string };

/**
 * Demande explicite d'une analyse à Claude (jamais déclenchée au chargement).
 * Hors ligne (Mac éteint), la demande est mise en file et part au retour du Mac ;
 * `queueLabel` dit ce qui partira (« Analyse de la séance du 12 nov. »).
 */
export function CoachRequest({ endpoint, label, initialError, queueLabel }: { endpoint: string; label: string; initialError?: string | null; queueLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pressed, setPressed] = useState(false);
  const gauge = useCoachGauge();
  // Coach en pause (abonnement presque plein ou analyses du jour faites) : le bouton attend, sans erreur à lire.
  const paused = gauge?.guest === true && (gauge.level === "plein" || gauge.left === 0);
  const connection = useConnection();
  const say = useSay();
  const queued = connection.queue.some((item) => item.kind === "request" && item.endpoint === endpoint);
  const offline = connection.status === "offline";

  function putInQueue() {
    connection.markOffline();
    connection.add({ kind: "request", endpoint, label: queueLabel ?? label });
  }

  async function request() {
    if (offline) {
      putInQueue();
      return;
    }
    setPressed(true);
    setBusy(true);
    setError(null);
    try {
      let response: Response;
      try {
        response = await fetch(endpoint, { method: "POST" });
      } catch {
        putInQueue();
        return;
      }
      if (!reachable(response.status)) {
        putInQueue();
        return;
      }
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

  if (queued) {
    return (
      <div>
        <button type="button" className="btn" disabled><Clock size={14} /> En file d&apos;attente</button>
        <p className="muted small" style={{ marginTop: 6 }}>{say("Partira au retour du Mac de Bastien ; tu peux la retirer dans le bandeau en haut.", "Partira au retour du Mac de Bastien ; vous pouvez la retirer dans le bandeau en haut.")}</p>
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="btn" onClick={() => void request()} disabled={busy || (paused && !offline)}>
        {offline ? <Clock size={14} /> : <Sparkles size={14} className={busy ? "spin" : undefined} />}
        {busy ? "Le coach réfléchit… (10 à 20 s)" : offline ? "Mettre en file pour le coach" : label}
      </button>
      <CoachGaugeLine reveal={pressed} />
      {error && !paused ? <p className="notice notice-error">{error}</p> : null}
    </div>
  );
}
