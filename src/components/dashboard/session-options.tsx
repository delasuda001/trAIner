"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { SessionOption } from "@/lib/engine/suggestion";
import { formatDuration, formatPace } from "@/lib/formatters";

const ROLE_LABEL: Record<SessionOption["role"], string> = { aerobic: "même rôle : aérobie facile", intensity: "même rôle : intensité" };
/** Au-delà de cette part de la largeur (ou d'un geste vif), la carte part au fond de la pile. */
const THROW_SHARE = 0.28;
const FLY_MS = 280;

function pace(option: SessionOption): string | null {
  const target = option.target;
  return target?.paceFastMps && target.paceSlowMps ? `${formatPace(target.paceSlowMps).replace("/km", "")}–${formatPace(target.paceFastMps)}` : null;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Motion = { kind: "idle" } | { kind: "drag"; dx: number } | { kind: "out"; dir: 1 | -1 } | { kind: "in" };

/**
 * Pile de cartes : la séance recommandée dessus (avec son pourquoi), les options de même rôle dessous.
 * Au doigt, la carte suit le pouce et laisse voir la suivante ; relâchée assez loin, elle part au fond de la
 * pile, sinon elle revient. La pile tourne en boucle. Sur ordi : flèches et ← → avec la même animation.
 * Moins de mouvement demandé : bascule immédiate. Choisir une option recale la séance d'après.
 */
export function SessionOptions({ recommended, options, chosen, date }: { recommended: ReactNode; options: SessionOption[]; chosen: string | null; date: string }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const count = options.length + 1;
  const [order, setOrder] = useState<number[]>(() => Array.from({ length: count }, (_, index) => index));
  const [motion, setMotion] = useState<Motion>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number; t: number; dragging: boolean; moved: boolean } | null>(null);
  const top = order[0];

  const next = useCallback((dir: 1 | -1 = 1) => {
    if (motion.kind === "out" || motion.kind === "in") return;
    if (reducedMotion()) {
      setOrder((current) => [...current.slice(1), current[0]]);
      setMotion({ kind: "idle" });
      return;
    }
    setMotion({ kind: "out", dir });
    window.setTimeout(() => {
      setOrder((current) => [...current.slice(1), current[0]]);
      setMotion({ kind: "idle" });
    }, FLY_MS);
  }, [motion.kind]);

  const previous = useCallback(() => {
    if (motion.kind === "out" || motion.kind === "in") return;
    setOrder((current) => [current[current.length - 1], ...current.slice(0, -1)]);
    if (reducedMotion()) return;
    setMotion({ kind: "in" });
    window.setTimeout(() => setMotion({ kind: "idle" }), FLY_MS);
  }, [motion.kind]);

  const goTo = useCallback((card: number) => {
    setOrder((current) => {
      const at = current.indexOf(card);
      return [...current.slice(at), ...current.slice(0, at)];
    });
    setMotion({ kind: "idle" });
  }, []);

  // ← → au clavier quand la pile a le focus ou est survolée (sans voler les flèches d'un champ de saisie).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = root.current;
      if (!element || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable)) return;
      if (!element.matches(":hover") && !element.contains(active)) return;
      event.preventDefault();
      if (event.key === "ArrowRight") next(-1);
      else previous();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, previous]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (motion.kind !== "idle" || event.button !== 0) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, dragging: false, moved: false };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.dragging) {
      // Geste vertical : on laisse la page défiler. Horizontal au-delà de 8 px : la carte suit le doigt.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
      if (Math.abs(dx) < 8) return;
      state.dragging = true;
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setMotion({ kind: "drag", dx });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    gesture.current = null;
    if (!state?.dragging || motion.kind !== "drag") return;
    const width = event.currentTarget.clientWidth || 1;
    const velocity = Math.abs(motion.dx) / Math.max(1, event.timeStamp - state.t);
    if (Math.abs(motion.dx) > width * THROW_SHARE || (velocity > 0.6 && Math.abs(motion.dx) > 40)) next(motion.dx > 0 ? 1 : -1);
    else setMotion({ kind: "idle" });
    // Un glisser n'est pas un clic sur un bouton de la carte.
    const swallow = (click: MouseEvent) => { click.stopPropagation(); click.preventDefault(); };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 50);
  }

  async function choose(key: string | null) {
    setBusy(true);
    await fetch("/api/session-choice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, date }) }).catch(() => null);
    router.refresh();
    setBusy(false);
    if (key == null) goTo(0);
  }

  function topStyle(): React.CSSProperties {
    if (motion.kind === "drag") return { transform: `translateX(${motion.dx}px) rotate(${motion.dx / 24}deg)`, transition: "none" };
    if (motion.kind === "out") return { transform: `translateX(${motion.dir * 115}%) rotate(${motion.dir * 14}deg)`, opacity: 0, transition: `transform ${FLY_MS}ms cubic-bezier(.3,.7,.4,1), opacity ${FLY_MS}ms ease` };
    if (motion.kind === "in") return { animation: `pile-in ${FLY_MS}ms cubic-bezier(.2,.8,.3,1) both` };
    return {};
  }

  const cards: ReactNode[] = [
    <>
      {chosen ? <p className="options-chosen-note">Tu as choisi une autre option : <button type="button" className="link-button" disabled={busy} onClick={() => void choose(null)}>revenir à la recommandée</button></p> : null}
      {recommended}
    </>,
    ...options.map((option) => (
      <>
        <div className="option-head">
          <span className="option-badge">≈ {Math.round(option.benefit * 100)} % du bénéfice</span>
          <span className="muted small">{ROLE_LABEL[option.role]}</span>
        </div>
        <h3 className="card-title option-title">{option.title}</h3>
        <div className="target">
          <span className="pill">{formatDuration(option.durationMin * 60)}</span>
          {pace(option) ? <span className="pill pill-strong">Allure {pace(option)}</span> : null}
          {option.target ? <span className="pill">{option.target.zone} · {option.target.heartRateLow}–{option.target.heartRateHigh} bpm</span> : null}
        </div>
        <p className="structure">{option.structure}</p>
        <p className="coach-line"><span className="coach-tag">Différence</span><span>{option.note}</span></p>
        {option.key === chosen
          ? <p className="option-picked"><Check size={14} /> Choisie : la suite de ta semaine en tient compte.</p>
          : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void choose(option.key)}>Choisir celle-ci</button>}
      </>
    )),
  ];
  const label = (card: number) => (card === 0 ? "Séance recommandée" : options[card - 1].title);

  return (
    <div className="pile-wrap" ref={root} aria-roledescription="pile de cartes" aria-label="Séance recommandée et options équivalentes">
      <div className="pile">
        {order.map((card, depth) => {
          const isTop = depth === 0;
          const isChosen = card > 0 && options[card - 1].key === chosen;
          return (
            <div
              key={card}
              className={`pile-card${isTop ? " is-top" : ""}${isChosen ? " is-chosen" : ""}`}
              style={{ zIndex: count - depth, ["--depth" as string]: Math.min(depth, 3), ...(isTop ? topStyle() : {}) }}
              aria-hidden={!isTop}
              inert={!isTop}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? () => { gesture.current = null; setMotion({ kind: "idle" }); } : undefined}
            >
              {cards[card]}
            </div>
          );
        })}
      </div>
      <div className="options-nav">
        <button type="button" className="btn btn-ghost icon-btn" aria-label="Carte précédente" onClick={() => previous()}><ChevronLeft size={16} /></button>
        <div className="options-dots" role="tablist">
          {Array.from({ length: count }, (_, card) => <button key={card} type="button" role="tab" aria-selected={card === top} aria-label={label(card)} className={`options-dot${card === top ? " on" : ""}${card > 0 && options[card - 1].key === chosen ? " chosen" : ""}`} onClick={() => goTo(card)} />)}
        </div>
        <span className="muted small options-hint">{top === 0 ? `Recommandée · ${options.length} autre${options.length > 1 ? "s" : ""} option${options.length > 1 ? "s" : ""} derrière` : `Option ${String.fromCharCode(65 + top)} sur ${count}`}</span>
        <button type="button" className="btn btn-ghost icon-btn" aria-label="Carte suivante" onClick={() => next(-1)}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
