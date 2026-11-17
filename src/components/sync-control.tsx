"use client";

import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useConnection, warmPages } from "@/components/offline/connection";
import { reachable } from "@/lib/offline/queue";

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

/** Explication actionnable d'un échec de synchro : ce qui se passe et quoi faire. */
function explain(error: string, guest: boolean): { title: string; action: React.ReactNode } {
  const lower = error.toLowerCase();
  if (guest && (lower.includes("clé") || lower.includes("401") || lower.includes("403") || lower.includes("garmin_api_key"))) {
    return { title: "Votre clé Garmin n'est pas encore active dans l'application.", action: <>Merci de prévenir Bastien : il doit ajouter ou renouveler votre clé Garmin Connect (Personal API) de son côté.</> };
  }
  if (lower.includes("clé") || lower.includes("401") || lower.includes("403") || lower.includes("garmin_api_key")) {
    return {
      title: "Garmin refuse la clé : elle a sans doute expiré ou été supprimée.",
      action: <>Recrée une clé sur <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noreferrer">Garmin Connect → Personal API</a>, colle-la dans <code>GARMIN_API_KEY</code> du fichier <code>.env.local</code>, puis relance l&apos;application.</>,
    };
  }
  if (lower.includes("injoignable") || lower.includes("fetch") || lower.includes("network")) {
    return { title: "Garmin est injoignable (pas de réseau ?).", action: guest ? <>Rien à faire : nouvel essai possible plus tard avec « Synchroniser ».</> : <>Rien à faire : réessaie plus tard avec « Synchroniser ».</> };
  }
  return { title: "La synchronisation Garmin a échoué.", action: guest ? <>Nouvel essai possible avec « Synchroniser » ; si le problème persiste, merci de prévenir Bastien (détail : {error}).</> : <>Réessaie avec « Synchroniser » ; si ça persiste, le détail est : {error}</> };
}

/** Synchro incrémentale : au chargement (si la dernière date de plus de 15 min) et sur demande. */
export function SyncControl({ lastSuccessAt, lastError, lastAttemptAt, guest = false }: { lastSuccessAt: string | null; lastError: string | null; lastAttemptAt: string | null; guest?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Une erreur n'est pertinente que si elle est postérieure au dernier succès.
  const [error, setError] = useState<string | null>(lastError && (!lastSuccessAt || (lastAttemptAt ?? "") > lastSuccessAt) ? lastError : null);
  const [dismissed, setDismissed] = useState(false);
  const [label, setLabel] = useState(() => relative(lastSuccessAt));
  const { status: connection, markOffline } = useConnection();
  const offline = connection === "offline";

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDismissed(false);
    let latestNewRunId: string | null = null;
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        let response: Response;
        try {
          response = await fetch("/api/sync", { method: "POST" });
        } catch {
          // Sillage injoignable (Mac éteint) : pas une erreur Garmin, le bandeau hors ligne le dit.
          markOffline();
          setStatus(null);
          return;
        }
        if (!reachable(response.status)) {
          markOffline();
          setStatus(null);
          return;
        }
        const body = (await response.json()) as SyncResponse;
        if (!response.ok || body.error) throw new Error(body.error ?? "Synchronisation impossible");
        latestNewRunId ??= body.latestNewRunId;
        if (body.pendingDetails === 0) break;
        setStatus(`Import des séries détaillées… ${body.pendingDetails} restantes`);
        router.refresh();
      }
      setStatus(null);
      setLabel(relative(new Date().toISOString()));
      router.refresh();
      void warmPages(latestNewRunId != null);
      // Seule une nouvelle course déclenche Claude, et seulement pour la plus récente.
      if (latestNewRunId) {
        setStatus(guest ? "Le coach analyse votre dernière séance…" : "Le coach analyse ta dernière séance…");
        await Promise.allSettled([
          fetch(`/api/activities/${encodeURIComponent(latestNewRunId)}/coach`, { method: "POST" }),
          fetch("/api/coach/outlook", { method: "POST" }),
        ]);
        setStatus(null);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Synchronisation impossible");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [router, guest, markOffline]);

  useEffect(() => {
    if (offline) return;
    if (!lastSuccessAt || Date.now() - Date.parse(lastSuccessAt) > AUTO_SYNC_AFTER_MS) {
      // Synchro de fond au chargement : déclenchée hors du rendu, sur un minuteur.
      const timer = setTimeout(() => void run(), 0);
      return () => clearTimeout(timer);
    }
  }, [lastSuccessAt, run, offline]);

  const detail = error ? explain(error, guest) : null;
  return (
    <>
      <span className={`sync-status${error ? " error" : ""}`}>
        {error ? "Synchro Garmin en échec" : status ?? (busy ? "Synchronisation…" : `Garmin · ${label}`)}
      </span>
      <button type="button" className="btn" onClick={() => void run()} disabled={busy || offline} aria-label="Synchroniser avec Garmin">
        <RefreshCw size={14} className={busy ? "spin" : undefined} />
        <span>Synchroniser</span>
      </button>
      {detail && !dismissed ? (
        <div className="sync-banner" role="alert">
          <div className="sync-banner-inner">
            <AlertTriangle size={16} style={{ color: "var(--critical-text)", flex: "none", marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <strong>{detail.title}</strong> Les données affichées sont celles de la dernière synchro réussie ({label.replace("synchronisé ", "")}). {detail.action}
            </div>
            <button type="button" className="btn btn-ghost icon-btn" onClick={() => setDismissed(true)} aria-label="Masquer"><X size={14} /></button>
          </div>
        </div>
      ) : null}
    </>
  );
}
