"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Children, useEffect, useRef, useState } from "react";

/**
 * Carte objectif à pages : on la fait glisser (téléphone) ou on passe d'une page à l'autre
 * avec les flèches et les points (écran large, clavier). Une page par objectif pertinent.
 * Défilement natif (scroll-snap) : rien ne bouge autour, la page garde la hauteur de la plus haute.
 */
export function GoalCarousel({ labels, children }: { labels: string[]; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const pages = Children.toArray(children);

  // La carte prend la hauteur de la page affichée (pas de vide sous une page courte).
  useEffect(() => {
    const slide = track.current?.children[active] as HTMLElement | undefined;
    if (!slide) return undefined;
    const measure = () => setHeight(slide.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slide);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    const element = track.current;
    if (!element) return undefined;
    const onScroll = () => setActive(Math.round(element.scrollLeft / Math.max(1, element.clientWidth)));
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  function go(index: number) {
    const element = track.current;
    if (!element) return;
    const target = Math.max(0, Math.min(pages.length - 1, index));
    element.scrollTo({ left: target * element.clientWidth, behavior: "smooth" });
    setActive(target);
  }

  if (pages.length <= 1) return <section className="card goal-carousel single">{pages}</section>;
  return (
    <section className="card goal-carousel" aria-roledescription="carrousel" aria-label="Tes objectifs">
      <div className="goal-carousel-track" ref={track} style={height ? { height } : undefined} tabIndex={0} onKeyDown={(event) => { if (event.key === "ArrowRight") go(active + 1); if (event.key === "ArrowLeft") go(active - 1); }}>
        {pages.map((page, index) => (
          <div key={labels[index] ?? index} className="goal-slide" role="group" aria-roledescription="page" aria-label={`${index + 1} sur ${pages.length} : ${labels[index] ?? ""}`} aria-hidden={index !== active}>
            {page}
          </div>
        ))}
      </div>
      <div className="goal-carousel-nav">
        <button type="button" className="goal-arrow" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Objectif précédent"><ChevronLeft size={16} /></button>
        <div className="goal-dots" role="tablist">
          {pages.map((_, index) => (
            <button key={index} type="button" role="tab" aria-selected={index === active} className={index === active ? "on" : ""} onClick={() => go(index)} aria-label={labels[index] ?? `Objectif ${index + 1}`}>
              <span className="goal-dot-label">{labels[index]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="goal-arrow" onClick={() => go(active + 1)} disabled={active === pages.length - 1} aria-label="Objectif suivant"><ChevronRight size={16} /></button>
      </div>
    </section>
  );
}
