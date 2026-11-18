"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * Téléphone : la carte s'affiche en version courte et se déplie sur place
 * (attribut `data-open` sur la carte). Invisible sur grand écran, où tout est visible.
 */
export function ExpandToggle({ label = "Le détail" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className="expand-toggle"
      aria-expanded={open}
      onClick={(event) => {
        const next = !open;
        setOpen(next);
        event.currentTarget.closest(".card-collapsible")?.toggleAttribute("data-open", next);
      }}
    >
      {open ? "Replier" : label} <ChevronDown size={14} className={open ? "flip" : undefined} aria-hidden />
    </button>
  );
}
