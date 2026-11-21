"use client";

import { ArrowLeft, ArrowRight, Gauge, MessageCircle, Target, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/ui/logo";
import { tourAllowedOn, tourSteps, type TourStepId } from "@/lib/tour/tour";

/** Événement qui rouvre la visite (bouton de Paramètres). */
export const TOUR_EVENT = "sillage:tour";
/** Le mini-guide du tableau de bord ne s'ouvre plus d'office une fois la visite faite. */
const START_GUIDE_KEY = "sillage_guide_seen";

const ACCENTS: Record<TourStepId, string> = {
  intro: "var(--sl-pink)",
  home: "var(--sl-yellow)",
  coach: "var(--sl-blue)",
  goal: "var(--sl-green)",
  end: "var(--sl-pink)",
};

type Geometry = { navInset: number; tabCenter: number | null };

/**
 * Visite guidée de premier lancement : plein écran au-dessus des onglets sur téléphone (l'onglet
 * concerné clignote, une flèche le montre), carte centrée sur ordinateur. Passable à tout moment,
 * au clavier (flèches, Échap) et au doigt (glisser). Aucune donnée lue, aucun appel au coach.
 */
export function WelcomeTour({ firstName, guest, autoOpen }: { firstName: string; guest: boolean; autoOpen: boolean }) {
  const pathname = usePathname();
  const steps = tourSteps(firstName, guest);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [geometry, setGeometry] = useState<Geometry>({ navInset: 0, tabCenter: null });
  const autoHandled = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);
  const current = steps[step];
  const last = step === steps.length - 1;

  // Ouverture d'office, une fois, sur une page qui s'y prête (pas la connexion ni la bienvenue).
  useEffect(() => {
    if (!autoOpen || autoHandled.current || !tourAllowedOn(pathname)) return undefined;
    autoHandled.current = true;
    const frame = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [autoOpen, pathname]);

  useEffect(() => {
    function replay() {
      setDirection("next");
      setStep(0);
      setOpen(true);
    }
    window.addEventListener(TOUR_EVENT, replay);
    return () => window.removeEventListener(TOUR_EVENT, replay);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setStep(0);
    try {
      window.localStorage.setItem(START_GUIDE_KEY, new Date().toISOString());
    } catch {
      // Stockage indisponible : le mini-guide pourra s'ouvrir, sans gêner.
    }
    // « Déjà vue » pour ce profil, sur tous ses appareils ; un échec réseau la fera simplement revenir.
    void fetch("/api/tour", { method: "POST", keepalive: true }).catch(() => undefined);
  }, []);

  const go = useCallback((target: number) => {
    const next = Math.max(0, Math.min(steps.length - 1, target));
    if (next === step) return;
    setDirection(next > step ? "next" : "prev");
    setStep(next);
  }, [step, steps.length]);

  // Onglet mis en avant, page figée derrière, focus sur le bouton principal.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    root.dataset.tour = current.tab ?? "none";
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primary.current?.focus({ preventScroll: true });
    return () => {
      delete root.dataset.tour;
      document.body.style.overflow = overflow;
    };
  }, [open, current.tab]);

  // Sur téléphone, la visite s'arrête au-dessus de la barre d'onglets, pour la montrer.
  useEffect(() => {
    if (!open) return undefined;
    function measure() {
      const nav = document.querySelector<HTMLElement>(".nav");
      const fixed = nav != null && window.getComputedStyle(nav).position === "fixed";
      const tab = fixed && current.tab ? nav.querySelector<HTMLElement>(`a[href="${current.tab}"]`) : null;
      const box = tab?.getBoundingClientRect();
      setGeometry({ navInset: fixed && nav ? Math.round(nav.getBoundingClientRect().height) : 0, tabCenter: box ? Math.round(box.left + box.width / 2) : null });
    }
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [open, current.tab]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight") go(step + 1);
      else if (event.key === "ArrowLeft") go(step - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, go, close]);

  if (!open) return null;

  return (
    <div
      className="tour"
      style={{ ["--tour-accent" as string]: ACCENTS[current.id], ["--tour-nav" as string]: `${geometry.navInset}px`, bottom: geometry.navInset || undefined }}
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const end = event.changedTouches[0]?.clientX;
        touchStart.current = null;
        if (start == null || end == null || Math.abs(end - start) < 50) return;
        go(end < start ? step + 1 : step - 1);
      }}
    >
      <div className="tour-panel" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-lead">
        <div className="tour-top">
          <div className="tour-progress">
            {steps.map((entry, index) => (
              <button key={entry.id} type="button" className={index < step ? "done" : index === step ? "on" : ""} onClick={() => go(index)} aria-label={`Étape ${index + 1} sur ${steps.length}`} aria-current={index === step ? "step" : undefined}><span /></button>
            ))}
          </div>
          {last ? null : <button type="button" className="tour-skip" onClick={close}>Passer <X size={14} aria-hidden /></button>}
        </div>

        <div key={`stage-${current.id}`} className={`tour-stage tour-in-${direction}`} aria-hidden>
          <Scene id={current.id} />
        </div>

        <div key={`body-${current.id}`} className={`tour-body tour-in-${direction}`}>
          <p className="tour-eyebrow">{current.eyebrow}</p>
          <h2 id="tour-title" className="tour-title">{current.title}</h2>
          <p id="tour-lead" className="tour-lead">{current.lead}</p>
          {current.points.length ? (
            <ul className="tour-points">
              {current.points.map((point, index) => <li key={point} style={{ animationDelay: `${0.12 + index * 0.08}s` }}>{point}</li>)}
            </ul>
          ) : null}
          {last ? (
            <div className="tour-jump">
              <Link href="/" className="tour-chip" onClick={close}><Gauge size={16} aria-hidden /> Accueil</Link>
              <Link href="/coach" className="tour-chip" onClick={close}><MessageCircle size={16} aria-hidden /> Coach</Link>
              <Link href="/objectif" className="tour-chip" onClick={close}><Target size={16} aria-hidden /> Objectif</Link>
            </div>
          ) : null}
        </div>

        <div className="tour-actions">
          {step > 0 ? <button type="button" className="btn" onClick={() => go(step - 1)} aria-label="Étape précédente"><ArrowLeft size={16} aria-hidden /> Retour</button> : <span />}
          {last
            ? <button ref={primary} type="button" className="btn btn-primary btn-lg" onClick={close}>C&apos;est parti</button>
            : <button ref={primary} type="button" className="btn btn-primary btn-lg" onClick={() => go(step + 1)}>{step === 0 ? "Commencer" : "Suivant"} <ArrowRight size={16} aria-hidden /></button>}
        </div>
      </div>
      {geometry.tabCenter != null ? <div className="tour-pointer" style={{ left: geometry.tabCenter }} aria-hidden><span>C&apos;est ici</span></div> : null}
    </div>
  );
}

/** Rouvre la visite depuis n'importe quelle page (Paramètres). */
export function ReplayTourButton() {
  return <button type="button" className="btn" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>Revoir la visite guidée</button>;
}

/** Illustrations : des exemples stylisés, jamais les chiffres du profil. */
function Scene({ id }: { id: TourStepId }) {
  if (id === "intro") return <IntroScene />;
  if (id === "home") return <HomeScene />;
  if (id === "coach") return <CoachScene />;
  if (id === "goal") return <GoalScene />;
  return <EndScene />;
}

function IntroScene() {
  return (
    <div className="scene scene-intro">
      <svg className="wake" viewBox="0 0 320 160" preserveAspectRatio="none">
        <path d="M-10 120 C 60 60, 120 150, 190 90 S 300 40, 340 70" stroke="var(--sl-pink)" />
        <path d="M-10 136 C 70 80, 130 166, 200 106 S 300 60, 340 90" stroke="var(--sl-blue)" />
        <path d="M-10 150 C 80 100, 140 176, 210 122 S 300 80, 340 108" stroke="var(--sl-yellow)" />
      </svg>
      <div className="intro-logo"><LogoMark size={88} /></div>
      <span className="intro-stop s1"><Gauge size={14} /> Accueil</span>
      <span className="intro-stop s2"><MessageCircle size={14} /> Coach</span>
      <span className="intro-stop s3"><Target size={14} /> Objectif</span>
    </div>
  );
}

const CALENDAR = ["z2", "", "z4", "z2", "", "z1", "z2", "z5", "", "z2", "z3", "", "z2", "today"];

function HomeScene() {
  return (
    <div className="scene scene-home">
      <span className="scene-tag">Exemple</span>
      <div className="mini-next">
        <span className="mini-eyebrow">Prochaine séance · demain</span>
        <strong>Footing</strong>
        <span className="mini-pills"><span>45 min</span><span><i className="dot z2" /> Z2</span><span>135–148 bpm</span></span>
        <span className="mini-sticker">Facile</span>
      </div>
      <div className="mini-row">
        <div className="mini-cal">
          {CALENDAR.map((zone, index) => <i key={index} className={zone} style={{ animationDelay: `${0.25 + index * 0.035}s` }} />)}
        </div>
        <div className="mini-levers">
          <span><b style={{ ["--w" as string]: "86%" }} /></span>
          <span><b style={{ ["--w" as string]: "64%" }} /></span>
          <span className="short"><b style={{ ["--w" as string]: "34%" }} /><em>levier</em></span>
        </div>
      </div>
    </div>
  );
}

function CoachScene() {
  return (
    <div className="scene scene-coach">
      <div className="bubble me">Mon fractionné de mardi, mieux que le précédent ?</div>
      <div className="bubble coach">
        <span className="typing"><i /><i /><i /></span>
        <div className="reply">
          <span className="reply-tags"><span className="t-fact">Faits</span><span className="t-compare">Comparaison</span><span className="t-idea">Piste</span></span>
          <span className="line" style={{ ["--w" as string]: "92%" }} />
          <span className="line" style={{ ["--w" as string]: "74%" }} />
          <span className="cited">2 séances citées</span>
        </div>
      </div>
    </div>
  );
}

function GoalScene() {
  return (
    <div className="scene scene-goal">
      <span className="scene-tag">Exemple</span>
      <div className="bib">
        <span className="mini-eyebrow">Objectif</span>
        <strong>Semi-marathon</strong>
        <span className="chrono">1:45:00</span>
      </div>
      <div className="track">
        <span className="track-label">Où tu en es</span>
        <div className="track-line"><i className="mark-you"><em>toi</em></i><i className="mark-target"><em>cible</em></i></div>
      </div>
    </div>
  );
}

function EndScene() {
  return (
    <div className="scene scene-end">
      <div className="burst">
        {Array.from({ length: 14 }, (_, index) => <i key={index} className={`z${(index % 5) + 1}`} style={{ ["--a" as string]: `${index * (360 / 14)}deg`, animationDelay: `${0.1 + (index % 4) * 0.04}s` }} />)}
      </div>
      <div className="end-sticker">Bonnes foulées !</div>
    </div>
  );
}
