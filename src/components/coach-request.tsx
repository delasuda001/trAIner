"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CoachResponse = { status: "ready" | "missing" | "error"; message?: string };

/** Demande explicite d'une analyse à Claude (jamais déclenchée au chargement). */
export function CoachRequest({ endpoint, label, initialError }: { endpoint: string; label: string; initialError?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function request() {
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
      <button type="button" className="btn" onClick={() => void request()} disabled={busy}>
        <Sparkles size={14} className={busy ? "spin" : undefined} />
        {busy ? "Le coach réfléchit… (10 à 20 s)" : label}
      </button>
      {error ? <p className="notice notice-error">{error}</p> : null}
    </div>
  );
}
