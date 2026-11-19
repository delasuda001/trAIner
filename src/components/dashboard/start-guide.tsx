"use client";

import { CalendarDays, CircleHelp, Footprints, Target, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSay } from "@/components/ui/register";

const STORAGE_KEY = "sillage_guide_seen";

/**
 * Mini-guide de 3 étapes à la première ouverture de la vue « essentiel ». Ignorable,
 * ré-ouvrable par le bouton « Guide ». Le « déjà vu » est une commodité de l'appareil
 * (localStorage) : sans elle, le guide s'affiche simplement de nouveau.
 */
export function StartGuide() {
  const say = useSay();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) return undefined;
    // Ouverture après le premier rendu (le rendu serveur ne connaît pas l'appareil).
    const frame = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function close() {
    setOpen(false);
    setStep(0);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Stockage indisponible (navigation privée) : le guide reviendra, sans gêner.
    }
  }

  const steps = [
    { icon: <Footprints size={28} />, color: "var(--sl-yellow)", title: say("Ta prochaine séance", "Votre prochaine séance"), text: say("La carte jaune dit quoi courir, quand, et à quelle fréquence cardiaque. Fais-la, Garmin synchronise, et le coach la commente.", "La carte jaune dit quoi courir, quand, et à quelle fréquence cardiaque. Faites-la, Garmin synchronise, et le coach la commente.") },
    { icon: <Target size={28} />, color: "var(--sl-pink)", title: say("Ta jauge d'objectif", "Votre jauge d'objectif"), text: say("Chaque barre est un levier (sorties par semaine, volume, sortie longue). La plus courte, c'est ce qui te rapprochera le plus vite de ton objectif.", "Chaque barre est un levier (sorties par semaine, volume, sortie longue). La plus courte, c'est ce qui vous rapprochera le plus vite de votre objectif.") },
    { icon: <CalendarDays size={28} />, color: "var(--sl-blue)", title: say("Ton calendrier", "Votre calendrier"), text: say("Une case par jour, colorée par intensité : bleu récupération, vert facile, jaune tempo, orange seuil, rose VO2max. Touche une séance pour son analyse ; « Voir le détail » ouvre tout le reste.", "Une case par jour, colorée par intensité : bleu récupération, vert facile, jaune tempo, orange seuil, rose VO2max. Touchez une séance pour son analyse ; « Voir le détail » ouvre tout le reste.") },
  ];
  const current = steps[step];

  return (
    <>
      <button type="button" className="btn guide-open" onClick={() => setOpen(true)}><CircleHelp size={14} /> Guide</button>
      {open ? (
        <div className="guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-title">
          <div className="card guide-card" style={{ ["--shadow-color" as string]: current.color }}>
            <button type="button" className="guide-close" onClick={close} aria-label="Fermer le guide"><X size={18} /></button>
            <div className="guide-icon" style={{ background: current.color }}>{current.icon}</div>
            <p className="card-eyebrow">Étape {step + 1} sur {steps.length}</p>
            <h2 id="guide-title" className="card-title">{current.title}</h2>
            <p>{current.text}</p>
            <div className="guide-dots" aria-hidden>{steps.map((entry, index) => <span key={entry.title} className={index === step ? "on" : ""} />)}</div>
            <div className="guide-actions">
              <button type="button" className="btn" onClick={close}>Passer</button>
              {step < steps.length - 1
                ? <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>Suivant</button>
                : <button type="button" className="btn btn-primary" onClick={close}>C&apos;est parti</button>}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
