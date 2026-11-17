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
  large: { label: "large", text: "Le coach tourne sur l'abonnement Claude de Bastien, partagé entre vous : il y a de la place, profites-en." },
  menager: { label: "à ménager", text: "L'abonnement de Bastien se remplit : garde le coach pour les questions qui comptent." },
  plein: { label: "presque plein", text: "Le coach fait une pause pour ménager l'abonnement de Bastien. Tes chiffres restent tous là." },
} as const;

/** Heure de remise à zéro, dans le fuseau de l'appareil (calculée après l'affichage pour éviter tout décalage). */
function useLocalTime(iso: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!iso) return;
    const date = new Date(iso);
    const sameDay = date.toDateString() === new Date().toDateString();
    const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fuseau de l'appareil, connu seulement côté navigateur
    setLabel(sameDay ? `aujourd'hui à ${time}` : `${date.toLocaleDateString("fr-FR", { weekday: "long" })} à ${time}`);
  }, [iso]);
  return label;
}

export function CoachGaugeLine({ compact = false }: { compact?: boolean }) {
  const gauge = useCoachGauge();
  const reset = useLocalTime(gauge && gauge.level !== "large" ? gauge.resetsAt : null);
  if (!gauge || !gauge.guest) return null;
  const level = LEVELS[gauge.level];
  const filled = gauge.level === "large" ? 1 : gauge.level === "menager" ? 2 : 3;
  return (
    <div className={`coach-gauge gauge-${gauge.level}`} role="status">
      <span className="gauge-head">
        <span className="gauge-bars" aria-hidden>{[1, 2, 3].map((index) => <span key={index} className={index <= filled ? "on" : ""} />)}</span>
        <span>Abonnement de Bastien : <strong>{level.label}</strong></span>
      </span>
      {compact && gauge.level === "large" && (gauge.left == null || gauge.left > 1) ? null : (
        <span className="gauge-text">
          {level.text}
          {gauge.level !== "large" && reset ? ` Remise à zéro ${reset}.` : ""}
          {gauge.left === 1 ? " Il te reste une analyse aujourd'hui : choisis celle qui te tente le plus !" : ""}
          {gauge.left === 0 ? " Tes analyses du jour sont faites : le coach revient pour toi demain, et tout ce qui est déjà analysé se relit librement." : ""}
        </span>
      )}
    </div>
  );
}
