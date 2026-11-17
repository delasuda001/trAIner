"use client";

import { CloudOff, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSay } from "@/components/ui/register";
import { describeQueueItem, enqueue, parseQueue, QUEUE_STORAGE_KEY, reachable, removeFromQueue, requestFor, type NewQueueItem, type QueueItem } from "@/lib/offline/queue";

/**
 * Sillage injoignable (Mac de Bastien éteint) : l'appareil affiche les pages gardées
 * par le service worker, signale la date des données, et met les demandes au coach
 * en file d'attente, envoyées dans l'ordre au retour du Mac.
 */
type Status = "online" | "offline";
type Connection = {
  status: Status;
  queue: QueueItem[];
  /** Met une demande en file ; false si elle y est déjà ou si la file est pleine. */
  add: (item: NewQueueItem) => boolean;
  remove: (id: string) => void;
  /** Signale un échec réseau constaté par un composant (bascule en hors ligne). */
  markOffline: () => void;
  flushing: boolean;
  report: FlushReport | null;
  closeReport: () => void;
};
type FlushReport = { sent: number; failed: string[] };

const ConnectionContext = createContext<Connection>({ status: "online", queue: [], add: () => false, remove: () => undefined, markOffline: () => undefined, flushing: false, report: null, closeReport: () => undefined });

export function useConnection(): Connection {
  return useContext(ConnectionContext);
}

const PING_TIMEOUT_MS = 4000;
const OFFLINE_RETRY_MS = 30_000;
const WARM_EVERY_MS = 30 * 60_000;
const WARM_KEY = "sillage_offline_warmed_at";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible (navigation privée) : la file vit le temps de la page.
  }
}

async function ping(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetch("/api/ping", { cache: "no-store", signal: controller.signal });
    return reachable(response.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Garde sur l'appareil les pages utiles hors ligne (au plus toutes les 30 min). */
export async function warmPages(force = false): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const last = Number(readStorage(WARM_KEY) ?? 0);
  if (!force && Date.now() - last < WARM_EVERY_MS) return;
  const response = await fetch("/api/offline", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return;
  const { urls } = (await response.json()) as { urls: string[] };
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: "warm", urls });
  writeStorage(WARM_KEY, String(Date.now()));
}

/** À la déconnexion : plus aucune donnée gardée sur l'appareil. */
export async function clearOfflineData(): Promise<void> {
  writeStorage(QUEUE_STORAGE_KEY, null);
  writeStorage(WARM_KEY, null);
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ type: "clear" });
  }
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("online");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [report, setReport] = useState<FlushReport | null>(null);
  const [flushing, setFlushing] = useState(false);
  const queueRef = useRef<QueueItem[]>([]);

  const save = useCallback((next: QueueItem[]) => {
    queueRef.current = next;
    setQueue(next);
    writeStorage(QUEUE_STORAGE_KEY, next.length ? JSON.stringify(next) : null);
  }, []);

  const flush = useCallback(async () => {
    if (!queueRef.current.length) return;
    setFlushing(true);
    let sent = 0;
    const failed: string[] = [];
    for (const item of [...queueRef.current]) {
      const { url, init } = requestFor(item);
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch {
        break;
      }
      if (!reachable(response.status)) break;
      const body = (await response.json().catch(() => null)) as { status?: string; message?: string; error?: string } | null;
      if (!response.ok || body?.status === "error") failed.push(`${describeQueueItem(item)} : ${body?.error ?? body?.message ?? "non traité"}`);
      else sent += 1;
      save(removeFromQueue(queueRef.current, item.id));
    }
    setFlushing(false);
    if (sent || failed.length) {
      setReport({ sent, failed });
      router.refresh();
    }
  }, [router, save]);

  const check = useCallback(async () => {
    const ok = await ping();
    setStatus(ok ? "online" : "offline");
    if (ok) {
      await flush();
      void warmPages();
    }
  }, [flush]);

  useEffect(() => {
    const stored = parseQueue(readStorage(QUEUE_STORAGE_KEY));
    queueRef.current = stored;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- file d'attente gardée sur l'appareil, lue après le rendu
    setQueue(stored);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    void check();
    const goOffline = () => setStatus("offline");
    const goOnline = () => void check();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [check]);

  useEffect(() => {
    if (status !== "offline") return;
    const timer = setInterval(() => void check(), OFFLINE_RETRY_MS);
    return () => clearInterval(timer);
  }, [status, check]);

  const add = useCallback((item: NewQueueItem) => {
    const result = enqueue(queueRef.current, item, new Date(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    if (result.added) save(result.queue);
    return result.added;
  }, [save]);

  const remove = useCallback((id: string) => save(removeFromQueue(queueRef.current, id)), [save]);
  const markOffline = useCallback(() => setStatus("offline"), []);

  return (
    <ConnectionContext.Provider value={{ status, queue, add, remove, markOffline, flushing, report, closeReport: () => setReport(null) }}>
      {children}
    </ConnectionContext.Provider>
  );
}

function snapshotDate(): string | null {
  const iso = document.documentElement.dataset.renderedAt;
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Bandeau en tête de page : hors ligne, date des données, ce qui partira au coach au retour du Mac. */
export function OfflineBanner() {
  const { status, queue, flushing, report, remove: onRemove, closeReport: onCloseReport } = useConnection();
  const say = useSay();
  const [snapshot, setSnapshot] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- date de la page affichée, connue seulement côté navigateur
    setSnapshot(status === "offline" ? snapshotDate() : null);
  }, [status]);

  if (status === "online" && !report && !flushing) return null;
  return (
    <div className={`offline-banner${status === "offline" ? " is-offline" : ""}`} role="status">
      {status === "offline" ? (
        <>
          <p className="offline-title"><CloudOff size={15} /> <strong>Hors ligne</strong> : Sillage ne répond pas (Mac de Bastien éteint ou sans réseau).</p>
          <p className="small">{snapshot ? say(`Tu consultes les données du ${snapshot}.`, `Vous consultez les données du ${snapshot}.`) : say("Tu consultes les dernières données gardées sur cet appareil.", "Vous consultez les dernières données gardées sur cet appareil.")} {say("Le coach est indisponible : tes demandes partiront à son retour.", "Le coach est indisponible : vos demandes partiront à son retour.")}</p>
        </>
      ) : null}
      {queue.length ? (
        <div className="offline-queue">
          <p className="small"><strong>{flushing ? <><Loader2 size={13} className="spin" /> Envoi au coach…</> : `Partira au retour du Mac (${queue.length}) :`}</strong></p>
          <ul>
            {queue.map((item) => (
              <li key={item.id}>
                <span>{describeQueueItem(item)}</span>
                {flushing ? null : <button type="button" className="btn btn-ghost icon-btn" onClick={() => onRemove(item.id)} aria-label={`Retirer de la file : ${describeQueueItem(item)}`} title="Retirer"><X size={13} /></button>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report && status === "online" ? (
        <div className="offline-report">
          <p className="small">
            {report.sent ? `${report.sent} demande${report.sent > 1 ? "s" : ""} en attente envoyée${report.sent > 1 ? "s" : ""} au coach.` : null}
            {report.failed.map((line) => <span key={line} className="block">Non envoyé : {line}</span>)}
          </p>
          <button type="button" className="btn btn-ghost icon-btn" onClick={onCloseReport} aria-label="Fermer"><X size={13} /></button>
        </div>
      ) : null}
    </div>
  );
}
