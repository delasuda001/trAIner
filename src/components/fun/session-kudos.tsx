"use client";

import { useEffect, useState } from "react";
import type { Kudos } from "@/lib/engine/kudos";

const RAYS = ["var(--sl-pink)", "var(--sl-blue)", "var(--sl-yellow)", "var(--sl-green)"];

/**
 * Félicitations après une séance difficile : un anneau qui se trace, une gerbe de traits aux
 * couleurs de Sillage, une carte qui monte. ≈ 4,5 s, un toucher la ferme. Une seule fois par
 * séance (enregistré côté serveur dès l'affichage). Moins de mouvement demandé : la carte seule.
 */
export function SessionKudos({ kudos }: { kudos: Kudos }) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const start = window.setTimeout(() => setShown(true), 600);
    void fetch("/api/kudos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: kudos.id }) }).catch(() => undefined);
    const leave = window.setTimeout(() => setLeaving(true), 5_200);
    const end = window.setTimeout(() => setShown(false), 5_700);
    return () => [start, leave, end].forEach((timer) => window.clearTimeout(timer));
  }, [kudos.id]);

  if (!shown) return null;
  return (
    <div className={`kudos${leaving ? " leaving" : ""}`} role="status" aria-live="polite" onClick={() => setLeaving(true)}>
      <div className="kudos-burst" aria-hidden>
        {Array.from({ length: 16 }, (_, index) => (
          <i key={index} style={{ ["--a" as string]: `${index * 22.5}deg`, ["--c" as string]: RAYS[index % RAYS.length], animationDelay: `${0.25 + (index % 4) * 0.04}s` }} />
        ))}
        <svg viewBox="0 0 64 64" className="kudos-ring"><circle cx="32" cy="32" r="26" /></svg>
        <span className="kudos-check">✓</span>
      </div>
      <div className="kudos-card">
        <strong>{kudos.headline}</strong>
        <span>{kudos.detail}</span>
      </div>
    </div>
  );
}
