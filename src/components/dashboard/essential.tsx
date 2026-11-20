import { ArrowRight, Flag, Repeat, Route, Target } from "lucide-react";
import Link from "next/link";
import { Say } from "@/components/ui/register";
import { CoachText } from "@/components/ui/coach-text";
import { GoalCarousel } from "./goal-carousel";
import type { AthleteLevel } from "@/lib/engine/athlete-level";
import type { ChronoPage, DistancePage, GoalPage, RegularityPage } from "@/lib/engine/goal-pages";
import { formatNumber, formatPace } from "@/lib/formatters";

/**
 * Carte objectif de l'accueil (les deux vues) : une page par objectif pertinent, qu'on fait
 * glisser. Ce qui sert à décider, en barres et en gros chiffres plutôt qu'en texte ; les calculs
 * sont ceux du moteur, rien n'est recalculé ici. Le niveau du coureur règle ce qui est montré
 * (pas de seuil ni d'allure du moment pour un débutant), jamais le conseil.
 */

const LEVER_COLOR: Record<string, string> = { frequency: "var(--sl-pink)", volume: "var(--sl-blue)", long_run: "var(--sl-green)", threshold: "var(--sl-orange)" };

export function GoalPages({ pages, level }: { pages: GoalPage[]; level: AthleteLevel }) {
  const noGoal = !pages.some((page) => page.kind !== "regularity");
  return (
    <GoalCarousel labels={pages.map(label)}>
      {pages.map((page) => (page.kind === "chrono" ? <ChronoSlide key={page.key} page={page} level={level} /> : page.kind === "distance" ? <DistanceSlide key={page.key} page={page} /> : <RegularitySlide key={page.key} page={page} noGoal={noGoal} />))}
    </GoalCarousel>
  );
}

function label(page: GoalPage): string {
  if (page.kind === "chrono") return page.gap.race;
  if (page.kind === "distance") return page.title.replace("Courir ", "");
  return "régularité";
}

function NextStep({ text, reached }: { text: string; reached: boolean }) {
  return <p className={`goal-next${reached ? " reached" : ""}`}><Flag size={14} aria-hidden /><span><CoachText text={text} voice /></span></p>;
}

function ChronoSlide({ page, level }: { page: ChronoPage; level: AthleteLevel }) {
  const { gap, marker } = page;
  // Débutant : pas d'allure au seuil ni d'allure estimée d'entrée (la vue détaillée et la page Objectif les gardent).
  const levers = level === "beginner" ? gap.levers.filter((lever) => lever.key !== "threshold") : gap.levers;
  const allMet = levers.every((lever) => lever.met);
  return (
    <div className="essential-goal">
      <div className="card-eyebrow"><Target size={13} /> Objectif chrono</div>
      <h2 className="essential-goal-title">{page.title} <span className="muted small">({formatPace(1000 / gap.goalPaceS)})</span></h2>
      {marker && level !== "beginner" ? (
        <>
          <p className="essential-pace"><Say tu={`Allure du moment : ${formatPace(1000 / marker.estimate.centerS)}`} /> <span className={`essential-chip ${marker.status}`}>{marker.status === "reachable" ? "à portée" : marker.status === "stretch" ? "ambitieux" : `${marker.gapS} s/km à gagner`}</span></p>
          <p className="essential-note small"><Say tu={`Ce que tu courrais aujourd'hui sur le ${marker.race} (base : ${marker.estimate.basis}).${gap.paceCaveat ? ` ${gap.paceCaveat}` : ""}`} /></p>
        </>
      ) : null}
      <ul className="lever-bars">
        {levers.map((lever) => (
          <li key={lever.key} className={lever.key === gap.main ? "main" : ""}>
            <div className="lever-label"><span>{lever.label}</span><span className="num">{lever.current} <span className="muted">/ {lever.needed}</span>{lever.met ? " ✓" : ""}</span></div>
            <div className="lever-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, lever.share) * 100)} aria-label={lever.label}>
              <span className="lever-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0.04, lever.share)) * 100)}%`, background: LEVER_COLOR[lever.key] ?? "var(--sl-blue)" }} />
              {lever.possibleShare != null ? <span className="lever-cap" style={{ left: `${Math.round(lever.possibleShare * 100)}%` }} title="Sorties possibles selon ton agenda" /> : null}
            </div>
          </li>
        ))}
      </ul>
      {page.next ? <NextStep text={page.next} reached /> : (
        <p className="essential-action"><strong>{allMet ? "Tout est au niveau" : "À faire d'abord"}</strong> <CoachText text={gap.action ?? gap.summary} voice /></p>
      )}
      {gap.availabilityNote && !page.next ? <p className="essential-note small"><Say tu={gap.availabilityNote} /></p> : null}
      <Link className="essential-link" href="/objectif">Voir l&apos;objectif <ArrowRight size={14} /></Link>
    </div>
  );
}

function DistanceSlide({ page }: { page: DistancePage }) {
  return (
    <div className="essential-goal">
      <div className="card-eyebrow"><Route size={13} /> Objectif distance</div>
      <h2 className="essential-goal-title">{page.title}</h2>
      <div className="goal-figure">
        <span className="big-number">{formatNumber(page.longestKm, 1)}<span className="unit">km</span></span>
        <span className="goal-figure-label"><Say tu={`ta plus longue sortie (8 semaines), sur ${formatNumber(page.targetKm, 0)} km visés`} /></span>
      </div>
      <div className="distance-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(page.share * 100)} aria-label="Distance atteinte">
        <span className="lever-fill" style={{ width: `${Math.round(Math.max(0.04, page.share) * 100)}%`, background: "var(--sl-green)" }} />
        <span className="distance-flag" aria-hidden><Flag size={14} /></span>
      </div>
      <NextStep text={page.next} reached={page.reached} />
    </div>
  );
}

function RegularitySlide({ page, noGoal }: { page: RegularityPage; noGoal: boolean }) {
  const unit = page.streakWeeks > 1 ? "semaines" : "semaine";
  return (
    <div className="essential-goal">
      <div className="card-eyebrow"><Repeat size={13} /> Régularité · {page.target} sorties / sem.</div>
      {/* Jamais de 0 en gros : sans série en cours, on montre ce qui a été tenu sur 8 semaines. */}
      <div className="goal-figure">
        {page.streakWeeks > 0 ? <span className="big-number">{page.streakWeeks}<span className="unit">{unit} d&apos;affilée</span></span>
          : page.weeksAtTarget > 0 ? <span className="big-number">{page.weeksAtTarget}<span className="unit">sem. sur 8 à la cible</span></span>
          : null}
        <span className={`state-badge streak-badge${page.streakWeeks >= 2 ? " on" : ""}`}>{page.streakWeeks >= 2 ? "Série en cours" : page.streakWeeks === 1 ? "C'est parti" : page.weeksAtTarget > 0 ? "À relancer" : "À lancer"}</span>
      </div>
      <div className="streak-row" aria-label={`Cette semaine : ${page.thisWeekRuns} sur ${page.target}`}>
        <span className="muted small">Cette semaine</span>
        <span className="streak-pips" aria-hidden>{Array.from({ length: Math.max(page.target, page.thisWeekRuns) }, (_, index) => <span key={index} className={index < page.thisWeekRuns ? "on" : ""} />)}</span>
        {page.streakWeeks > 0 ? <span className="muted small num">{page.weeksAtTarget}/8 sem. à la cible</span> : null}
      </div>
      <NextStep text={page.next} reached={false} />
      {noGoal ? <Link className="essential-link" href="/objectif"><Say tu="Ajouter un objectif (distance, chrono)" /> <ArrowRight size={14} /></Link> : null}
    </div>
  );
}
