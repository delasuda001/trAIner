"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SUGGESTION_ZONE, ZoneDot } from "@/components/ui/session-type";
import type { Suggestion } from "@/lib/engine/suggestion";
import { formatDuration, formatPace } from "@/lib/formatters";

type Then = NonNullable<Suggestion["then"]>;

const LONG_PRESS_MS = 450;

/**
 * Ligne « Ensuite » de la carte prochaine séance : un clic (ordinateur) ou un appui long (téléphone)
 * ouvre le détail de la séance d'après dans une fenêtre, sur fond flouté. Échap, la croix ou un
 * toucher sur le fond la ferment.
 */
export function NextAfter({ then }: { then: Then }) {
  const [open, setOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  function cancelPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  }

  const target = then.target ?? null;
  const pace = target?.paceFastMps && target.paceSlowMps ? `${formatPace(target.paceSlowMps)}–${formatPace(target.paceFastMps)}` : null;

  return (
    <>
      <button
        type="button"
        className={`next-after${pressing ? " pressing" : ""}`}
        aria-haspopup="dialog"
        title="Voir le détail (appui long sur téléphone)"
        onPointerDown={(event) => {
          opened.current = false;
          if (event.pointerType !== "touch") return;
          setPressing(true);
          timer.current = setTimeout(() => { opened.current = true; setPressing(false); setOpen(true); navigator.vibrate?.(10); }, LONG_PRESS_MS);
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          // Au doigt, seul l'appui long ouvre (un toucher bref laisse défiler la page) ; à la souris et au clavier, le clic.
          if ((event.nativeEvent as PointerEvent).pointerType === "touch") return;
          if (!opened.current) setOpen(true);
        }}
      >
        <span className="pill" style={{ padding: "2px 10px" }}><ZoneDot zone={SUGGESTION_ZONE[then.type]} />Ensuite</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}><strong>{then.title}</strong>{then.durationMin ? ` · ${formatDuration(then.durationMin * 60)}` : ""}</span>
        <span className="muted small">{then.when.label}</span>
      </button>
      {open ? createPortal(
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet card" role="dialog" aria-modal="true" aria-labelledby="next-after-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="btn btn-ghost icon-btn sheet-close" aria-label="Fermer" onClick={() => setOpen(false)}><X size={16} /></button>
            <div className="card-eyebrow">Ensuite · {then.when.label}</div>
            <h2 id="next-after-title" className="card-title" style={{ marginTop: 4 }}>{then.title}</h2>
            <div className="target">
              {then.durationMin ? <span className="pill">{formatDuration(then.durationMin * 60)}</span> : null}
              {pace ? <span className="pill pill-strong">Allure {pace}</span> : null}
              {target ? <span className="pill"><ZoneDot zone={SUGGESTION_ZONE[then.type]} />{target.zone} · {target.heartRateLow}–{target.heartRateHigh} bpm</span> : null}
            </div>
            {then.structure ? <p className="structure" style={{ marginTop: 12 }}>{then.structure}</p> : null}
            {then.reason ? <p className="coach-line" style={{ marginTop: 8 }}><span className="coach-tag">Pourquoi</span><span>{then.reason}</span></p> : null}
            <p className="muted small" style={{ marginTop: 10 }}>Elle peut encore changer : elle sera recalculée après ta prochaine séance.</p>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
