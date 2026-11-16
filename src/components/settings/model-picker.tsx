"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const OPTIONS = [
  { value: "sonnet", label: "Sonnet", hint: "par défaut : bon équilibre qualité / quota" },
  { value: "opus", label: "Opus", hint: "plus fin, consomme plus vite le quota" },
  { value: "haiku", label: "Haiku", hint: "très économe, analyses plus sommaires" },
] as const;

export function ModelPicker({ current }: { current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [saved, setSaved] = useState(false);

  async function choose(model: string) {
    setValue(model);
    setSaved(false);
    const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
    if (response.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div>
      <div className="chips">
        {OPTIONS.map((option) => (
          <button key={option.value} type="button" className={`chip${value === option.value ? " selected" : ""}`} onClick={() => void choose(option.value)} title={option.hint}>{option.label}</button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>{OPTIONS.find((option) => option.value === value)?.hint ?? "modèle défini par CLAUDE_COACH_MODEL"}{saved ? <span className="saved" style={{ marginLeft: 8 }}><Check size={13} /> Enregistré pour les prochains appels.</span> : null}</p>
    </div>
  );
}
