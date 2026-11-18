import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { SUGGESTION_ZONE, ZONE_NAMES, zoneColor, type Zone } from "@/components/ui/session-type";
import { Say } from "@/components/ui/register";
import type { CalendarDay, CalendarWeek, TrainingCalendar } from "@/lib/engine/calendar";
import type { SuggestionType } from "@/lib/engine/suggestion";
import { formatDate, formatNumber } from "@/lib/formatters";

const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Calendrier des séances, 8 semaines : une case par jour, couleur de la zone dominante
 * (même code que partout), séance proposée en pointillé rose. À droite, les sorties de
 * la semaine face à la cible : des pastilles pleines pour ce qui est fait, jamais de rouge.
 */
export function SessionCalendar({ calendar, zonesNote }: { calendar: TrainingCalendar; zonesNote: string }) {
  const { target } = calendar;
  return (
    <section className="card cal-card" aria-labelledby="cal-title">
      <div className="row-between">
        <div className="card-eyebrow"><CalendarDays size={13} /> <span id="cal-title"><Say tu="Tes séances" /> · {calendar.weeks.length} semaines</span></div>
        {target ? <span className="cal-target">cible {target} sorties / sem.</span> : null}
      </div>
      <div className="cal-grid" role="table" aria-label="Séances par jour">
        <div className="cal-row cal-head" role="row">
          <span role="columnheader" className="cal-week-label" />
          {DAY_LETTERS.map((letter, index) => <span key={index} role="columnheader" className="cal-letter">{letter}</span>)}
          <span role="columnheader" className="cal-count-head">courses</span>
        </div>
        {calendar.weeks.map((week) => <WeekRow key={week.start} week={week} target={target} />)}
      </div>
      <p className="cal-summary">
        <Say tu={summary(calendar)} />
      </p>
      <div className="legend cal-legend">
        {([1, 2, 3, 4, 5] as Zone[]).map((zone) => <span key={zone}><span className="legend-swatch" style={{ background: zoneColor(zone) }} />{ZONE_NAMES[zone].split(" ").slice(1).join(" ")}</span>)}
        <span><span className="cal-swatch-other" />autre sport</span>
        <span><span className="cal-swatch-planned" />proposée</span>
      </div>
      <p className="cal-zones"><Say tu={`Couleur = zone FC dominante. ${zonesNote}`} /></p>
    </section>
  );
}

function summary(calendar: TrainingCalendar): string {
  const average = `${formatNumber(calendar.averageRunsPerWeek, 1)} sortie${calendar.averageRunsPerWeek >= 2 ? "s" : ""} par semaine en moyenne sur les ${calendar.completedWeeks} semaines terminées`;
  if (!calendar.target) return `${average}.`;
  const current = calendar.weeks.at(-1);
  const left = current ? Math.max(0, calendar.target - current.runs) : 0;
  const thisWeek = left === 0 ? "Cette semaine : cible atteinte." : `Cette semaine : ${current?.runs ?? 0} sur ${calendar.target}, encore ${left} possible${left > 1 ? "s" : ""}.`;
  return `${average}. ${thisWeek}`;
}

function WeekRow({ week, target }: { week: CalendarWeek; target: number | null }) {
  const pips = target ? Math.max(target, week.runs) : 0;
  return (
    <div className={`cal-row${week.current ? " current" : ""}`} role="row">
      <span role="rowheader" className="cal-week-label" aria-label={week.current ? "Semaine en cours" : `Semaine du ${formatDate(week.start, "short")}`}>{formatDate(week.start, "short")}</span>
      {week.days.map((day) => <DayCell key={day.date} day={day} />)}
      <span role="cell" className="cal-count" aria-label={`${week.runs} course${week.runs > 1 ? "s" : ""}${target ? ` sur ${target}` : ""}${week.runKm ? `, ${formatNumber(week.runKm, 1)} km` : ""}`}>
        {target ? (
          <span className="cal-pips" aria-hidden>
            {Array.from({ length: pips }, (_, index) => <span key={index} className={`cal-pip${index < week.runs ? " on" : ""}${index >= target ? " extra" : ""}`} />)}
          </span>
        ) : <span aria-hidden>{week.runs}</span>}
        <span className="cal-km" aria-hidden>{week.runKm ? `${formatNumber(week.runKm, 0)} km` : ""}</span>
      </span>
    </div>
  );
}

function DayCell({ day }: { day: CalendarDay }) {
  const runs = day.activities.filter((activity) => activity.run);
  const others = day.activities.filter((activity) => !activity.run);
  const main = runs[0] ?? null;
  const classes = ["cal-day", main ? "run" : "", !main && others.length ? "other" : "", day.planned && !main ? `planned${day.planned.alternative ? " planned-alt" : ""}` : "", day.isToday ? "today" : "", day.isFuture ? "future" : ""].filter(Boolean).join(" ");
  const plannedZone = day.planned ? SUGGESTION_ZONE[day.planned.type as SuggestionType] ?? null : null;
  const style = main ? { ["--cal" as string]: zoneColor((main.zone ?? null) as Zone | null) } : day.planned && !main ? { ["--cal" as string]: zoneColor(plannedZone) } : undefined;
  const label = [formatDate(day.date, "short"), ...day.activities.map((activity) => `${activity.title}${activity.distanceM ? ` ${formatNumber(activity.distanceM / 1000, 1)} km` : ""}`), day.planned && !main ? (day.planned.alternative ? "séance proposée (jour de repli)" : "séance proposée") : null].filter(Boolean).join(" · ");
  const content = (
    <>
      {runs.length > 1 ? <span className="cal-multi">{runs.length}</span> : null}
      {others.length && main ? <span className="cal-other-dot" /> : null}
    </>
  );
  if (main) {
    return <Link role="cell" href={`/activities/${main.id}`} className={classes} style={style} title={label} aria-label={label}>{content}</Link>;
  }
  return <span role="cell" className={classes} style={style} title={label} aria-label={label}>{content}</span>;
}
