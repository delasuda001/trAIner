"use client";

import { ScanEye, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type QualityFindingView = {
  id: string;
  profileName: string;
  subjectKind: string;
  subjectId: string;
  source: "rules" | "review";
  code: string;
  severity: "error" | "warning" | "info";
  where: string;
  message: string;
  createdAt: string;
};

const SEVERITY_LABELS: Record<QualityFindingView["severity"], string> = { error: "erreur", warning: "à vérifier", info: "info" };

/**
 * Constats du contrôle de cohérence (règles en code après chaque analyse) et de la relecture IA
 * par lots. Vue de Bastien seulement : jamais montrée à un invité.
 */
export function QualityPanel({ findings, reviewRunning }: { findings: QualityFindingView[]; reviewRunning: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function post(body: unknown) {
    const response = await fetch("/api/quality", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await response.json().catch(() => ({}))) as { profiles?: number; subjects?: number; findings?: number; started?: boolean; error?: string };
  }

  async function run() {
    setBusy(true);
    const result = await post({ action: "run" });
    setBusy(false);
    setMessage(result.error ?? `${result.subjects ?? 0} analyses relues sur ${result.profiles ?? 0} profils : ${result.findings ?? 0} constat(s).`);
    router.refresh();
  }

  async function review() {
    setBusy(true);
    const result = await post({ action: "review" });
    setBusy(false);
    setMessage(result.error ?? (result.started ? "Relecture lancée en arrière-plan (Haiku, plafonds du banc) : recharge la page dans quelques minutes." : "Une relecture tourne déjà."));
  }

  async function dismiss(id: string) {
    await post({ action: "dismiss", id });
    router.refresh();
  }

  const recurring = Object.entries(findings.reduce<Record<string, number>>((counts, finding) => ({ ...counts, [finding.code]: (counts[finding.code] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div>
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
          <ShieldCheck size={14} /> {busy ? "Contrôle en cours…" : "Tout revérifier (sans appel au coach)"}
        </button>
        <button type="button" className="btn" disabled={busy || reviewRunning} onClick={() => void review()} title="Un appel par profil, au plus 6 analyses récentes non relues ; comptée dans les plafonds du banc">
          <ScanEye size={14} /> {reviewRunning ? "Relecture en cours…" : "Relecture IA (Haiku)"}
        </button>
        {message ? <span className="muted small">{message}</span> : null}
      </div>
      {recurring.length ? (
        <p className="muted small" style={{ marginTop: 10 }}>
          Les plus fréquents : {recurring.map(([code, count]) => `${code} (${count})`).join(", ")}.
        </p>
      ) : null}
      {findings.length ? (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead><tr><th>Qui</th><th>Où</th><th>Gravité</th><th>Constat</th><th>Source</th><th /></tr></thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id}>
                  <td>{finding.profileName}</td>
                  <td>{finding.subjectKind === "session" ? <span>{finding.where}<br /><span className="muted small">séance {finding.subjectId.replace(/^garmin:/, "")}</span></span> : finding.where}</td>
                  <td className={finding.severity === "error" ? "text-warning" : ""}>{SEVERITY_LABELS[finding.severity]}</td>
                  <td>{finding.message}<br /><span className="muted small">{finding.code}</span></td>
                  <td className="muted small">{finding.source === "rules" ? "règles" : "relecture IA"}</td>
                  <td><button type="button" className="btn btn-ghost" aria-label="Écarter ce constat" title="Écarter (ne revient pas tant que le texte est identique)" onClick={() => void dismiss(finding.id)}><X size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted small" style={{ marginTop: 8 }}>Aucun constat ouvert.</p>}
      <p className="muted small" style={{ marginTop: 8 }}>Les séances de Bastien s&apos;ouvrent depuis son tableau de bord ; celles des invités ne sont visibles que de leur côté.{" "}<Link href="/bilan">Bilan hebdomadaire</Link></p>
    </div>
  );
}
