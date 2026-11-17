"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * Tuile du coup d'œil (téléphone). La grande carte correspondante est repliée sur
 * téléphone pour éviter le doublon ; un toucher l'ouvre juste en dessous.
 */
export function GlanceTile({ panel, anchor, className, children }: { panel: "next" | "progress"; anchor: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  function toggle() {
    const next = !open;
    setOpen(next);
    document.documentElement.toggleAttribute(`data-open-${panel}`, next);
    if (next) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  return (
    <button type="button" className={`glance-tile ${className ?? ""}`} aria-expanded={open} onClick={toggle}>
      {children}
      <span className="glance-more">{open ? "Replier" : "Le détail"} <ChevronDown size={13} className={open ? "flip" : undefined} aria-hidden /></span>
    </button>
  );
}
