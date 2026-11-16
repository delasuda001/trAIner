"use client";

import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Lance le banc à la main (quand le quota est disponible). Les plafonds s'appliquent. */
export function BenchButton({ pending, running }: { pending: number; running: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "started" | "error">(running ? "started" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  async function start() {
    const response = await fetch("/api/bench", { method: "POST" });
    const body = (await response.json().catch(() => ({}))) as { started?: boolean; reason?: string };
    setState(body.started ? "started" : "error");
    setMessage(body.started ? "Banc lancé en arrière-plan : recharge la page dans quelques minutes." : body.reason ?? "Lancement impossible.");
    router.refresh();
  }
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 10, marginTop: 8 }}>
      <button type="button" className="btn" disabled={!pending || state === "started"} onClick={() => void start()}>
        <FlaskConical size={14} /> {state === "started" ? "Banc en cours…" : `Lancer le banc (${pending} tâche${pending > 1 ? "s" : ""})`}
      </button>
      {message ? <span className={state === "error" ? "form-error" : "muted small"}>{message}</span> : null}
    </div>
  );
}
