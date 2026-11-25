"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { SessionOption } from "@/lib/engine/suggestion";
import { formatDuration, formatPace } from "@/lib/formatters";

const ROLE_LABEL: Record<SessionOption["role"], string> = { aerobic: "même rôle : aérobie facile", intensity: "même rôle : intensité" };

function pace(option: SessionOption): string | null {
  const target = option.target;
  return target?.paceFastMps && target.paceSlowMps ? `${formatPace(target.paceSlowMps).replace("/km", "")}–${formatPace(target.paceFastMps)}` : null;
}

/**
 * Prochaine séance et ses plans B et C : la recommandée en tête (avec son pourquoi), deux options de même
 * rôle dans la semaine, chacune avec le bénéfice estimé. Balayage au doigt, flèches ou ← → au clavier,
 * points indicateurs. Choisir une option recale la séance d'après.
 */
export function SessionOptions({ recommended, options, chosen, date }: { recommended: ReactNode; options: SessionOption[]; chosen: string | null; date: string }) {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const count = options.length + 1;

  const go = useCallback((next: number) => {
    const target = Math.max(0, Math.min(count - 1, next));
    const element = track.current;
    if (!element) return;
    element.scrollTo({ left: target * element.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setIndex(target);
  }, [count]);

  // Position réelle après un balayage au doigt (défilement natif aimanté).
  function onScroll() {
    const element = track.current;
    if (element) setIndex(Math.round(element.scrollLeft / Math.max(1, element.clientWidth)));
  }

  // ← → au clavier quand la carte a le focus ou est survolée (sans voler les flèches d'un champ de saisie).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = root.current;
      if (!element || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable)) return;
      if (!element.matches(":hover") && !element.contains(active)) return;
      event.preventDefault();
      go(index + (event.key === "ArrowRight" ? 1 : -1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, index]);

  async function choose(key: string | null) {
    setBusy(true);
    await fetch("/api/session-choice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, date }) }).catch(() => null);
    router.refresh();
    setBusy(false);
    if (key == null) go(0);
  }

  return (
    <div className="options" ref={root} aria-roledescription="carrousel" aria-label="Séance recommandée et options équivalentes">
      <div className="options-track" ref={track} onScroll={onScroll} tabIndex={0}>
        <div className="options-slide" aria-roledescription="diapositive" aria-label={`1 sur ${count} : séance recommandée`}>
          {chosen ? <p className="options-chosen-note">Tu as choisi une autre option : <button type="button" className="link-button" disabled={busy} onClick={() => void choose(null)}>revenir à la recommandée</button></p> : null}
          {recommended}
        </div>
        {options.map((option, position) => (
          <div key={option.key} className={`options-slide option${option.key === chosen ? " is-chosen" : ""}`} aria-roledescription="diapositive" aria-label={`${position + 2} sur ${count} : ${option.title}`}>
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
          </div>
        ))}
      </div>
      <div className="options-nav">
        <button type="button" className="btn btn-ghost icon-btn" aria-label="Précédente" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={16} /></button>
        <div className="options-dots" role="tablist">
          {Array.from({ length: count }, (_, dot) => <button key={dot} type="button" role="tab" aria-selected={dot === index} aria-label={dot === 0 ? "Séance recommandée" : options[dot - 1].title} className={`options-dot${dot === index ? " on" : ""}${dot > 0 && options[dot - 1].key === chosen ? " chosen" : ""}`} onClick={() => go(dot)} />)}
        </div>
        <span className="muted small options-hint">{index === 0 ? "Recommandée · d'autres options →" : `Option ${index === 1 ? "B" : "C"}`}</span>
        <button type="button" className="btn btn-ghost icon-btn" aria-label="Suivante" disabled={index === count - 1} onClick={() => go(index + 1)}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
