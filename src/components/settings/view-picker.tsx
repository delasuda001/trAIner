"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSay } from "@/components/ui/register";
import type { ViewMode } from "@/lib/view-mode";

export function ViewPicker({ current }: { current: ViewMode }) {
  const router = useRouter();
  const say = useSay();
  const [value, setValue] = useState<ViewMode>(current);
  const [saved, setSaved] = useState(false);
  const options: Array<{ value: ViewMode; label: string; hint: string }> = [
    { value: "essential", label: "Essentiel", hint: say("Prochaine séance, objectif, calendrier et forme d'un coup d'œil ; le détail reste à un toucher.", "Prochaine séance, objectif, calendrier et forme d'un coup d'œil ; le détail reste à un toucher.") },
    { value: "full", label: "Complet", hint: say("Toutes les cartes : récupération, dernière séance, volume, intensité.", "Toutes les cartes : récupération, dernière séance, volume, intensité.") },
  ];

  async function choose(view: ViewMode) {
    setValue(view);
    setSaved(false);
    const response = await fetch("/api/view", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view }) });
    if (response.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div>
      <div className="chips">
        {options.map((option) => (
          <button key={option.value} type="button" className={`chip${value === option.value ? " selected" : ""}`} onClick={() => void choose(option.value)}>{option.label}</button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>{options.find((option) => option.value === value)?.hint}{saved ? <span className="saved" style={{ marginLeft: 8 }}><Check size={13} /> Enregistré.</span> : null}</p>
    </div>
  );
}
