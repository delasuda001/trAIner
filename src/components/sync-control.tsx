"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type SyncResponse = { newActivities: number; latestNewRunId: string | null; pendingDetails: number; error?: string };

const AUTO_SYNC_AFTER_MS = 15 * 60 * 1000;
const MAX_ROUNDS = 12;

function relative(iso: string | null): string {
  if (!iso) return "jamais synchronisé";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "synchronisé à l'instant";
  if (minutes < 60) return `synchronisé il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `synchronisé il y a ${hours} h`;
  return `synchronisé il y a ${Math.round(hours / 24)} j`;
}

/** Synchro incrémentale : au chargement (si la dernière date de plus de 15 min) et sur demande. */
export function SyncControl({ lastSuccessAt, lastError }: { lastSuccessAt: string | null; lastError: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(lastError);
  const [label, setLabel] = useState(() => relative(lastSuccessAt));

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    let latestNewRunId: string | null = null;
    let newActivities = 0;
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const response = await fetch("/api/sync", { method: "POST" });
        const body = (await response.json()) as SyncResponse;
        if (!response.ok || body.error) throw new Error(body.error ?? "Synchronisation impossible");
        newActivities += body.newActivities;
        latestNewRunId ??= body.latestNewRunId;
        if (body.pendingDetails === 0) break;
        setStatus(`Import des séries détaillées… ${body.pendingDetails} restantes`);
        router.refresh();
      }
      setStatus(null);
      setLabel(relative(new Date().toISOString()));
      router.refresh();
      // Seule une nouvelle course déclenche Claude, et seulement pour la plus récente.
      if (latestNewRunId) {
        setStatus("Le coach analyse ta dernière séance…");
        await Promise.allSettled([
          fetch(`/api/activities/${encodeURIComponent(latestNewRunId)}/coach`, { method: "POST" }),
          fetch("/api/coach/outlook", { method: "POST" }),
        ]);
        setStatus(null);
        router.refresh();
      } else if (newActivities > 0) {
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Synchronisation impossible");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    if (!lastSuccessAt || Date.now() - Date.parse(lastSuccessAt) > AUTO_SYNC_AFTER_MS) {
      // Synchro de fond au chargement : déclenchée hors du rendu, sur un minuteur.
      const timer = setTimeout(() => void run(), 0);
      return () => clearTimeout(timer);
    }
  }, [lastSuccessAt, run]);

  return (
    <>
      <span className={`sync-status${error ? " error" : ""}`} title={error ?? undefined}>
        {error ? "Synchro Garmin en échec" : status ?? (busy ? "Synchronisation…" : `Garmin · ${label}`)}
      </span>
      <button type="button" className="btn" onClick={() => void run()} disabled={busy} aria-label="Synchroniser avec Garmin">
        <RefreshCw size={14} className={busy ? "spin" : undefined} />
        <span>Synchroniser</span>
      </button>
    </>
  );
}
