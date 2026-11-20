"use client";

import { useEffect, useState } from "react";
import { celebrationMessage } from "@/lib/profiles/celebration";

const SEEN_KEY = "sillage_celebration_day";

/** Petits cœurs discrets dans l'en-tête (décoratifs, ignorés par les lecteurs d'écran). */
export function HeaderHearts() {
  return (
    <span className="header-hearts" aria-hidden>
      <span>♥</span><span>♥</span><span>♥</span>
    </span>
  );
}

/**
 * Arrivée fêtée : envolée de cœurs et banderole avec un message tiré au hasard, une fois par jour
 * (à la première ouverture). Courte (≈ 3 s), non bloquante (aucun clic intercepté), et réduite à la
 * seule banderole si l'appareil demande moins d'animations.
 */
export function ArrivalCelebration() {
  const [message, setMessage] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const today = new Date().toDateString();
    try {
      if (window.localStorage.getItem(SEEN_KEY) === today && !new URLSearchParams(window.location.search).has("coeurs")) return undefined;
      window.localStorage.setItem(SEEN_KEY, today);
    } catch {
      // Stockage indisponible : on fête quand même, sans s'en souvenir.
    }
    const frame = window.requestAnimationFrame(() => {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      setMessage(celebrationMessage());
    });
    const timer = window.setTimeout(() => setMessage(null), 3600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  if (!message) return null;
  return (
    <div className={`celebration${reduced ? " reduced" : ""}`} aria-live="polite">
      {reduced ? null : (
        <div className="celebration-hearts" aria-hidden>
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} style={{ left: `${(index * 53) % 100}%`, animationDelay: `${(index % 6) * 0.12}s`, fontSize: `${18 + ((index * 7) % 18)}px`, ["--drift" as string]: `${((index * 37) % 60) - 30}px` }}>♥</span>
          ))}
        </div>
      )}
      <div className="celebration-banner">{message}</div>
    </div>
  );
}
