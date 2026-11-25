"use client";

import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Bouton de Bastien sur la carte d'un invité : ouvre son espace tel qu'il le voit (lecture seule). */
export function ViewAsButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    if (response?.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setBusy(false);
    setError("Ouverture impossible.");
  }
  return (
    <>
      <button type="button" className="btn" disabled={busy} onClick={() => void open()} title={`Ouvrir Sillage tel que ${name} le voit, en lecture seule. ${name} verra dans ses Paramètres que tu as ouvert son espace.`}><Eye size={14} /> Voir comme {name}</button>
      {error ? <span className="muted small">{error}</span> : null}
    </>
  );
}
