"use client";

import { Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccessPanel({ suspended, publicUrl, guestsWeeklyCap, guestsWeekUsed, trainingOptOut }: { suspended: boolean; publicUrl: string | null; guestsWeeklyCap: number; guestsWeekUsed: number; trainingOptOut: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState(publicUrl ?? "");
  const [cap, setCap] = useState(String(Math.round(guestsWeeklyCap / 1000)));
  const [message, setMessage] = useState<string | null>(null);

  async function put(body: Record<string, unknown>, done: string) {
    setMessage(null);
    const response = await fetch("/api/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await response.json().catch(() => null)) as { error?: string } | null;
    setMessage(response.ok ? done : json?.error ?? "Réglage refusé.");
    if (response.ok) router.refresh();
  }

  return (
    <div className="stack">
      <div className={`access-switch${suspended ? " is-off" : ""}`}>
        <div>
          <strong>{suspended ? "Accès des invités coupé" : "Accès des invités ouvert"}</strong>
          <p className="muted small" style={{ margin: "2px 0 0" }}>{suspended ? "Plus aucun invité ne peut entrer ; leurs appareils restent enregistrés et retrouvent l'accès à la réouverture." : "Coupe d'un coup l'accès de tous les invités (connexions, liens, appareils déjà connectés)."}</p>
        </div>
        <button type="button" className={`btn ${suspended ? "btn-primary" : ""}`} onClick={() => void put({ guestsSuspended: !suspended }, suspended ? "Accès rouvert." : "Accès coupé.")}><Power size={14} /> {suspended ? "Rouvrir" : "Couper l'accès"}</button>
      </div>
      <p className="muted small">Pour couper aussi le lien public lui-même (y compris pour toi à distance) : <code>tailscale funnel --https=443 off</code> dans un terminal du Mac.</p>
      <div className="form-grid">
        <label className="field">
          <span>Adresse publique (tunnel)</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://ton-mac.xxxx.ts.net" inputMode="url" autoCapitalize="none" />
        </label>
        <div className="form-actions"><button type="button" className="btn" onClick={() => void put({ publicUrl: url.trim() || null }, "Adresse enregistrée.")}>Enregistrer</button></div>
        <label className="field">
          <span>Plafond commun des invités / 7 jours (k tokens)</span>
          <input inputMode="numeric" value={cap} onChange={(event) => setCap(event.target.value)} />
        </label>
        <div className="form-actions"><button type="button" className="btn" onClick={() => void put({ guestsWeeklyCap: Math.max(0, Number(cap) || 0) * 1000 }, "Plafond enregistré.")}>Enregistrer</button> <span className="muted small">utilisé : {Math.round(guestsWeekUsed / 1000)} k</span></div>
      </div>
      <label className="check-line">
        <input type="checkbox" checked={trainingOptOut} onChange={(event) => void put({ trainingOptOut: event.target.checked }, event.target.checked ? "Noté : l'accueil des invités le mentionne." : "Noté : l'accueil renvoie aux règles d'Anthropic.")} />
        <span>
          J&apos;ai désactivé « Aider à améliorer Claude » sur mon compte claude.ai (Paramètres → Confidentialité).
          <span className="muted small" style={{ display: "block" }}>Coché, l&apos;accueil des invités indique qu&apos;Anthropic n&apos;utilise pas ces échanges pour entraîner ses modèles. Décoché, il renvoie simplement aux règles d&apos;Anthropic pour les comptes personnels.</span>
        </span>
      </label>
      {message ? <p className="muted small">{message}</p> : null}
    </div>
  );
}
