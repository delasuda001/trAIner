"use client";

import { Plus } from "lucide-react";

/** Exemples cliquables sous un champ libre : un toucher remplit ou complète le champ. */
export function ExampleChips({ label = "Exemples", examples, onPick }: { label?: string; examples: string[]; onPick: (example: string) => void }) {
  return (
    <div className="example-chips" aria-label={label}>
      <span className="muted small">{label} :</span>
      {examples.map((example) => (
        <button key={example} type="button" className="chip chip-sm chip-example" onClick={() => onPick(example)}><Plus size={11} aria-hidden /> {example}</button>
      ))}
    </div>
  );
}
