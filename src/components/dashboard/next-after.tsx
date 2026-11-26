"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SUGGESTION_ZONE, ZoneDot } from "@/components/ui/session-type";
import type { Suggestion } from "@/lib/engine/suggestion";
import { formatDuration, formatPace } from "@/lib/formatters";

type Then = NonNullable<Suggestion["then"]>;

const LONG_PRESS_MS = 400;
const MORPH_MS = 320;
const CLOSE_DRAG_PX = 90;

type Phase = "closed" | "opening" | "open" | "closing";

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Ligne « Ensuite » de la carte prochaine séance. Un clic (ordinateur) ou un appui long (téléphone) la fait
 * grandir sur place jusqu'à la vue détaillée, sur fond flouté : la carte se soulève de la ligne, puis son
 * contenu apparaît. Retour : glisser vers le bas, toucher hors de la carte, la croix ou Échap ; la carte
 * reprend alors sa place. Moins de mouvement demandé : ouverture et fermeture sans animation.
 */
export function NextAfter({ then }: { then: Then }) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [pressing, setPressing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const row = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);
  const drag = useRef<{ y: number; id: number } | null>(null);

  /** Transformation qui ramène la carte détaillée sur la ligne « Ensuite » (technique FLIP). */
  const toRow = useCallback((): string => {
    const from = row.current?.getBoundingClientRect();
    const to = sheet.current?.getBoundingClientRect();
    if (!from || !to || !to.width || !to.height) return "none";
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  }, []);

  const open = useCallback(() => {
    setPhase(reducedMotion() ? "open" : "opening");
  }, []);

  const close = useCallback(() => {
    if (phase === "closed" || phase === "closing") return;
    if (reducedMotion()) {
      setPhase("closed");
      return;
    }
    const element = sheet.current;
    if (element) {
      element.style.transition = `transform ${MORPH_MS}ms cubic-bezier(.4,0,.2,1)`;
      element.style.transform = toRow();
    }
    setPhase("closing");
    window.setTimeout(() => { setPhase("closed"); setDragY(0); }, MORPH_MS);
  }, [phase, toRow]);

  // Ouverture : la carte part de la ligne et grandit jusqu'à sa place.
  useLayoutEffect(() => {
    if (phase !== "opening") return;
    const element = sheet.current;
    if (!element) return;
    element.style.transition = "none";
    element.style.transform = toRow();
    void element.offsetWidth;
    element.style.transition = `transform ${MORPH_MS}ms cubic-bezier(.2,.8,.2,1)`;
    element.style.transform = "none";
    const done = window.setTimeout(() => setPhase("open"), MORPH_MS);
    return () => window.clearTimeout(done);
  }, [phase, toRow]);

  useEffect(() => {
    if (phase === "closed") return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [phase, close]);

  function cancelPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  }

  const target = then.target ?? null;
  const pace = target?.paceFastMps && target.paceSlowMps ? `${formatPace(target.paceSlowMps).replace("/km", "")}–${formatPace(target.paceFastMps)}` : null;
  const visible = phase !== "closed";

  return (
    <>
      <button
        ref={row}
        type="button"
        className={`next-after${pressing ? " pressing" : ""}`}
        style={visible ? { visibility: "hidden" } : undefined}
        aria-haspopup="dialog"
        aria-expanded={visible}
        title="Voir le détail (appui long sur téléphone)"
        onPointerDown={(event) => {
          opened.current = false;
          if (event.pointerType !== "touch") return;
          setPressing(true);
          timer.current = setTimeout(() => { opened.current = true; setPressing(false); open(); navigator.vibrate?.(10); }, LONG_PRESS_MS);
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          // Au doigt, seul l'appui long ouvre (un toucher bref laisse défiler la page) ; à la souris et au clavier, le clic.
          if ((event.nativeEvent as PointerEvent).pointerType === "touch") return;
          if (!opened.current) open();
        }}
      >
        <span className="pill" style={{ padding: "2px 10px" }}><ZoneDot zone={SUGGESTION_ZONE[then.type]} />Ensuite</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}><strong>{then.title}</strong>{then.durationMin ? ` · ${formatDuration(then.durationMin * 60)}` : ""}</span>
        <span className="muted small">{then.when.label}</span>
      </button>
      {visible ? createPortal(
        <div className={`morph-backdrop phase-${phase}`} onClick={close}>
          <div
            ref={sheet}
            className={`morph-card phase-${phase}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="next-after-title"
            style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => { if (phase === "open") drag.current = { y: event.clientY, id: event.pointerId }; }}
            onPointerMove={(event) => {
              if (!drag.current || drag.current.id !== event.pointerId) return;
              const dy = Math.max(0, event.clientY - drag.current.y);
              if (dy > 6) setDragY(dy);
            }}
            onPointerUp={() => {
              drag.current = null;
              if (dragY > CLOSE_DRAG_PX) close();
              else setDragY(0);
            }}
            onPointerCancel={() => { drag.current = null; setDragY(0); }}
          >
            <span className="morph-grip" aria-hidden />
            <button type="button" className="btn btn-ghost icon-btn sheet-close" aria-label="Fermer" onClick={close}><X size={16} /></button>
            <div className="morph-content">
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
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
