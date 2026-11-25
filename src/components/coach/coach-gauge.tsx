"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { CoachGauge } from "@/lib/server/quota";

/**
 * Jauge de l'abonnement Claude de Bastien, montrée aux invités à côté de chaque
 * bouton qui appelle le coach. Ton positif : une ressource partagée, pas une
 * restriction. Aucun chiffre de tokens ; le compte d'analyses restantes n'apparaît
 * qu'à 1 ou 0.
 */

const GaugeContext = createContext<CoachGauge | null>(null);

export function GaugeProvider({ gauge, children }: { gauge: CoachGauge | null; children: React.ReactNode }) {
  return <GaugeContext.Provider value={gauge}>{children}</GaugeContext.Provider>;
}

export function useCoachGauge(): CoachGauge | null {
  return useContext(GaugeContext);
}

const LEVELS = {
  large: { label: "large", text: "Le coach fonctionne avec l'abonnement Claude de Bastien, partagé entre les testeurs : il reste de la marge, n'hésite pas." },
  menager: { label: "à ménager", text: "L'abonnement de Bastien se remplit : réserve le coach aux questions qui comptent." },
  plein: { label: "presque plein", text: "Le coach fait une pause pour ménager l'abonnement de Bastien. Tous tes chiffres restent consultables." },
} as const;

/** Heure de remise à zéro, dans le fuseau de l'appareil (calculée après l'affichage pour éviter tout décalage). */
export function useLocalTime(iso: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fuseau de l'appareil, connu seulement côté navigateur */
    if (!iso) {
      setLabel(null);
      return;
    }
    const date = new Date(iso);
    const tomorrow = new Date(Date.now() + 86_400_000);
    const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const day = date.toDateString() === new Date().toDateString() ? "aujourd'hui" : date.toDateString() === tomorrow.toDateString() ? "demain" : date.toLocaleDateString("fr-FR", { weekday: "long" });
    setLabel(`${day} à ${time}`);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [iso]);
  return label;
}

/** Âge du relevé de l'abonnement (« à l'instant », « il y a 3 min », « il y a 2 h »), calculé côté navigateur. */
function useAgo(iso: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!iso) return;
    const update = () => {
      const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
      setLabel(minutes < 1 ? "à l'instant" : minutes < 60 ? `il y a ${minutes} min` : `il y a ${Math.round(minutes / 60)} h`);
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [iso]);
  return label;
}

/**
 * Une seule ligne discrète : trois pastilles et le niveau. Le détail (remise à zéro,
 * dernière analyse du jour) ne s'ouvre qu'au toucher, ou quand l'invité vient
 * d'appuyer sur un bouton du coach (`reveal`).
 */
export function CoachGaugeLine({ reveal = false, popover = false }: { reveal?: boolean; popover?: boolean }) {
  const gauge = useCoachGauge();
  const [open, setOpen] = useState(false);
  const reset = useLocalTime(gauge && gauge.level !== "large" ? gauge.resetsAt : null);
  const ago = useAgo(gauge?.checkedAt ?? null);
  if (!gauge || !gauge.guest) return null;
  const level = LEVELS[gauge.level];
  const filled = gauge.level === "large" ? 1 : gauge.level === "menager" ? 2 : 3;
  const shown = open || (reveal && (gauge.level !== "large" || (gauge.left != null && gauge.left <= 1)));
  return (
    <div className={`coach-gauge gauge-${gauge.level}${popover ? " gauge-popover" : ""}`}>
      <button type="button" className="gauge-head" aria-expanded={shown} onClick={() => setOpen((value) => !value)} title="L'abonnement Claude de Bastien, partagé entre les testeurs">
        <span className="gauge-bars" aria-hidden>{[1, 2, 3].map((index) => <span key={index} className={index <= filled ? "on" : ""} />)}</span>
        <span>Abonnement de Bastien : <strong>{level.label}</strong></span>
      </button>
      {shown ? (
        <span className="gauge-text" role="status">
          {level.text}
          {gauge.level !== "large" && reset ? ` Remise à zéro ${reset}.` : ""}
          {gauge.stale ? ` Dernier relevé de l'abonnement ${ago ?? "inconnu"} : la jauge reste prudente.` : ago ? ` Relevé ${ago}.` : ""}
          {gauge.left === 1 ? " Il te reste une analyse aujourd'hui : choisis celle qui t'intéresse le plus." : ""}
          {gauge.left === 0 ? " Tes analyses du jour sont faites : le coach sera de nouveau disponible demain, et tout ce qui est déjà analysé reste consultable." : ""}
        </span>
      ) : null}
    </div>
  );
}

function Meter({ label, used, detail }: { label: string; used: number; detail: string }) {
  const level = used >= 0.999 ? "full" : used >= 0.75 ? "high" : "ok";
  return (
    <div className={`quota-meter-row meter-${level}`}>
      <span className="quota-meter-label">{label}</span>
      <span className="quota-meter-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)} aria-label={label}><i style={{ width: `${Math.max(2, Math.round(used * 100))}%` }} /></span>
      <span className="quota-meter-detail">{detail}</span>
    </div>
  );
}

function questionsWord(count: number): string {
  return count <= 0 ? "plus de question" : `≈ ${count} question${count > 1 ? "s" : ""} restante${count > 1 ? "s" : ""}`;
}

/**
 * Jauge toujours visible près du chat : pour un invité, son quota personnel (jour, 7 jours
 * glissants) en questions restantes, plus l'état de l'abonnement partagé ; pour Bastien, les
 * fenêtres 5 h et 7 jours de son abonnement. Mise à jour à chaque réponse (rafraîchissement du layout).
 */
export function QuotaMeter() {
  const gauge = useCoachGauge();
  const latest = gauge?.plan.slice().sort((a, b) => b.used - a.used)[0] ?? null;
  const reset = useLocalTime(latest && latest.used >= 0.75 ? latest.resetsAt : null);
  if (!gauge) return null;
  if (!gauge.guest) {
    if (!gauge.plan.length) return null;
    return (
      <div className="quota-meter" aria-label="Ton abonnement Claude">
        <span className="quota-meter-title">Ton abonnement Claude</span>
        {gauge.plan.map((window) => <Meter key={window.label} label={window.label} used={window.used} detail={`${Math.round(window.used * 100)} %`} />)}
        {reset ? <span className="muted small">Remise à zéro de la fenêtre la plus chargée {reset}.</span> : null}
      </div>
    );
  }
  if (!gauge.today && !gauge.week) return null;
  return (
    <div className="quota-meter" aria-label="Ton quota coach">
      <span className="quota-meter-title">Ton quota coach</span>
      {gauge.today ? <Meter label="Aujourd'hui" used={gauge.today.used} detail={questionsWord(gauge.today.left)} /> : null}
      {gauge.week ? <Meter label="7 jours" used={gauge.week.used} detail={questionsWord(gauge.week.left)} /> : null}
    </div>
  );
}
