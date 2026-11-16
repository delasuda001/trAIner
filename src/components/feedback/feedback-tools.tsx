"use client";

import { Copy, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CopyMarkdown({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn" onClick={() => { void navigator.clipboard?.writeText(markdown).then(() => setCopied(true)); }}>
      <Copy size={14} /> {copied ? "Copié" : "Copier en Markdown"}
    </button>
  );
}

export function SynthesisButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/feedback/synthesis", { method: "POST" });
    const json = (await response.json().catch(() => null)) as { status?: string; message?: string } | null;
    setBusy(false);
    if (json?.status === "error") setError(json.message ?? "Échec.");
    else router.refresh();
  }
  return (
    <span className="row small" style={{ flexWrap: "wrap", gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}><Sparkles size={14} className={busy ? "spin" : undefined} /> {busy ? "Claude lit les retours…" : label}</button>
      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}

export function DeleteFeedback({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button type="button" className="btn btn-ghost icon-btn" title="Supprimer ce retour" aria-label="Supprimer ce retour" onClick={() => { void fetch(`/api/feedback?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => router.refresh()); }}>
      <Trash2 size={13} />
    </button>
  );
}
