import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CircleHelp, Gauge, HeartPulse, Moon, MoveRight, Target, ThumbsUp, Waves, Wrench } from "lucide-react";
import Link from "next/link";
import { CoachRequest } from "@/components/coach-request";
import { IntensityChart, ProgressionChart, SparkBars, Sparkline, WeeklyVolumeChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { CoachStamp } from "@/components/ui/coach-stamp";
import { Fact } from "@/components/ui/fact";
import { familyOfKind, FAMILY_STYLE, SessionGlyph, SUGGESTION_FAMILY } from "@/components/ui/session-type";
import type { OutlookCoachOutput } from "@/lib/coach/outlook-coach";
import type { SessionCoachOutput } from "@/lib/coach/session-coach";
import { daysBetween } from "@/lib/dates";
import { sessionTitle } from "@/lib/engine/activity-metrics";
import { CONFIDENCE_LABELS, hrvCompare, hrvMeaning, loadMeaning, PROGRESSION_LABELS, progressionSentence, restingHrCompare, restingHrMeaning, sleepCompare, sleepMeaning, type Tone } from "@/lib/engine/explain";
import { SPORT_LABELS, VERDICT_TONES } from "@/lib/engine/labels";
import { VERDICT_LABELS } from "@/lib/engine/verdict";
import { formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import type { Dashboard } from "@/lib/server/analytics";
import type { CoachResult } from "@/lib/server/coach-service";
import type { Sport } from "@/lib/source/types";

const TONE_COLOR: Record<Tone, string> = { good: "var(--good)", warning: "var(--warning)", critical: "var(--critical)", neutral: "var(--text-3)" };

function ToneDot({ tone }: { tone: Tone }) {
  return <span aria-hidden className="dot" style={{ ["--glyph" as string]: TONE_COLOR[tone], marginTop: 5 }} />;
}

/* ---------- Prochaine séance ---------- */
export function SuggestionCard({ dashboard, coach }: { dashboard: Dashboard; coach: CoachResult<OutlookCoachOutput> }) {
  const { suggestion, goal, today } = dashboard;
  const { primary, facts } = suggestion;
  const family = SUGGESTION_FAMILY[primary.type];
  const target = primary.target;
  const ready = coach.status === "ready" ? coach.output : null;
  const paceCenter = target?.paceFastMps && target.paceSlowMps ? (target.paceFastMps + target.paceSlowMps) / 2 : null;
  return (
    <section className="card card-hero rise" style={{ ["--tint" as string]: FAMILY_STYLE[family].color, ["--i" as string]: 0 }} aria-labelledby="next-title">
      <div className="row-between">
        <div className="row">
          <SessionGlyph family={family} icon={primary.type === "race" ? "race" : primary.type === "taper" ? "taper" : undefined} />
          <div>
            <div className="card-eyebrow"><CalendarClock size={13} /> Prochaine séance</div>
            <h2 id="next-title" className="card-title" style={{ marginTop: 2 }}>{primary.title}</h2>
          </div>
        </div>
        <Badge tone="accent" label={suggestion.when.label} icon="calendar" />
      </div>
      <div className="target">
        {primary.durationMin ? <span className="pill">{formatDuration(primary.durationMin * 60)}</span> : null}
        {target ? <span className="pill pill-accent">{target.zone} · {target.heartRateLow}–{target.heartRateHigh} bpm</span> : null}
        {paceCenter ? <span className="pill" title={`${formatPace(target?.paceSlowMps)} à ${formatPace(target?.paceFastMps)}`}>≈ {formatPace(paceCenter)}</span> : null}
      </div>
      {primary.type !== "endurance" && primary.type !== "long" ? <p className="structure">{primary.structure}</p> : null}
      <div className="coach-lines">
        <p className="coach-line"><span className="coach-tag">Pourquoi</span><span>{ready ? ready.suggestionWhy : suggestion.reason}</span></p>
        <p className="coach-line"><span className="coach-tag">Comment</span><span>{ready ? ready.executionTip : primary.structure}</span></p>
      </div>
      {coach.status === "ready" ? <div style={{ marginTop: 8 }}><CoachStamp model={coach.model} createdAt={coach.createdAt} prefix="Avis" /></div> : null}
      {suggestion.alternative ? <p className="alt"><strong>Plan B · {suggestion.alternative.title}</strong> ({formatDuration(suggestion.alternative.durationMin * 60)}). {suggestion.alternative.reason}</p> : null}
      {suggestion.then ? (
        <div className="next-after">
          <span className="muted small">Ensuite</span>
          <SessionGlyph family={SUGGESTION_FAMILY[suggestion.then.type]} size="sm" />
          <span style={{ flex: 1, minWidth: 0 }}><strong>{suggestion.then.title}</strong>{suggestion.then.durationMin ? ` · ${formatDuration(suggestion.then.durationMin * 60)}` : ""}</span>
          <span className="muted small">{suggestion.then.when.label}</span>
        </div>
      ) : null}
      <WeekStrip dashboard={dashboard} />
      <div className="card-foot goal-strip">
        <Target size={13} />
        {goal && (goal.title || goal.eventDate) ? (
          <span style={{ flex: 1 }}>{goal.title || "Course"}{goal.eventDate ? ` · dans ${daysBetween(today, goal.eventDate)} jours` : ""} · {goal.runsPerWeek} sortie{goal.runsPerWeek > 1 ? "s" : ""}/sem.</span>
        ) : (
          <span style={{ flex: 1 }}>Pas d&apos;objectif renseigné : le coach vise ta progression aérobie, à {formatNumber(facts.runsPerWeek8w, 1)} sortie{facts.runsPerWeek8w >= 2 ? "s" : ""}/sem.</span>
        )}
        <Link href="/objectif">{goal ? "Modifier" : "Définir"}</Link>
      </div>
    </section>
  );
}

const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

/** La semaine en un coup d'œil : ce qui est fait (plein) et ce qui est proposé (contour). */
function WeekStrip({ dashboard }: { dashboard: Dashboard }) {
  return (
    <div className="week-strip" aria-label="Semaine en cours">
      {dashboard.week.map((day, index) => {
        const isToday = day.date === dashboard.today;
        const done = day.done[0];
        const doneFamily = done ? familyOfKind(done.kind) : null;
        const plannedFamily = day.planned ? SUGGESTION_FAMILY[day.planned as keyof typeof SUGGESTION_FAMILY] : null;
        return (
          <div key={day.date} className={`week-day${isToday ? " today" : ""}`}>
            <span className="week-letter">{DAY_LETTERS[index]}</span>
            {doneFamily ? (
              <span className="week-dot done" style={{ ["--glyph" as string]: FAMILY_STYLE[doneFamily].color }} title={`${formatDate(day.date, "short")} : ${done?.kind ? FAMILY_STYLE[doneFamily].label : SPORT_LABELS[done?.sport as Sport] ?? "activité"}`} />
            ) : plannedFamily ? (
              <span className="week-dot planned" style={{ ["--glyph" as string]: FAMILY_STYLE[plannedFamily].color }} title={`Proposé : ${FAMILY_STYLE[plannedFamily].label}`} />
            ) : (
              <span className="week-dot" />
            )}
          </div>
        );
      })}
      <span className="muted small" style={{ marginLeft: "auto" }}>plein = fait · contour = proposé</span>
    </div>
  );
}

/* ---------- Progression ---------- */
export function ProgressionCard({ dashboard, coach }: { dashboard: Dashboard; coach: CoachResult<OutlookCoachOutput> }) {
  const { progression } = dashboard;
  const state = PROGRESSION_LABELS[progression.state];
  const gain = progression.paceGainSPerKm;
  const stateColor = progression.state === "progressing" ? "var(--good)" : progression.state === "regressing" ? "var(--warning)" : progression.state === "stable" ? "var(--accent)" : "var(--text-3)";
  const Mark = progression.state === "progressing" ? ArrowUpRight : progression.state === "regressing" ? ArrowDownRight : progression.state === "stable" ? MoveRight : CircleHelp;
  const toPace = (speed: number | null) => (speed ? 1000 / speed : null);
  const change = gain == null ? null : Math.abs(gain) < 1 ? `Même allure à ${progression.referenceHeartRateBpm} bpm` : `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"} à ${progression.referenceHeartRateBpm} bpm`;
  const noise = progression.state === "stable" && progression.runToRunSpreadSPerKm != null
    ? `Écart dans la variation normale : tes sorties faciles varient de ±${progression.runToRunSpreadSPerKm} s/km d'une fois à l'autre.`
    : null;
  return (
    <section className="card card-hero rise" style={{ ["--tint" as string]: stateColor, ["--i" as string]: 1 }} aria-labelledby="progress-title">
      <div className="card-eyebrow"><Gauge size={13} /> Progression aérobie</div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="state-mark" style={{ ["--state" as string]: stateColor }} aria-hidden><Mark size={28} strokeWidth={2.4} /></span>
        <div>
          <h2 id="progress-title" className="state-title">{state.label}</h2>
          <p className="state-sub">
            {change ? <><strong>{change}</strong> vs les {progression.windowWeeks} semaines précédentes</> : "Pas assez de sorties faciles comparables pour l'instant"}
            {progression.confidence ? <span className="muted"> · confiance {CONFIDENCE_LABELS[progression.confidence]}</span> : null}
          </p>
        </div>
      </div>
      <p className="card-text">{coach.status === "ready" ? coach.output.progressionSentence : noise ?? progressionSentence(progression)}</p>
      {coach.status === "ready" ? <div style={{ marginTop: 4 }}><CoachStamp model={coach.model} createdAt={coach.createdAt} prefix="Lecture" /></div> : null}
      <ProgressionChart
        points={progression.points.map((point) => ({ date: point.date, secondsPerKm: 1000 / point.speedAtReferenceHr }))}
        recentStart={progression.recent.start}
        recentLevel={toPace(progression.recent.speedAtReferenceHr)}
        previousLevel={toPace(progression.previous.speedAtReferenceHr)}
        referenceHr={progression.referenceHeartRateBpm}
      />
      <div className="legend" style={{ marginTop: 4 }}>
        <span><span className="legend-swatch" style={{ background: "var(--accent)" }} />{progression.windowWeeks} dernières semaines</span>
        <span><span className="legend-swatch" style={{ background: "var(--series-muted)" }} />avant</span>
        <span className="muted">1 point = 1 sortie facile · pointillés = médianes</span>
      </div>
      <div className="facts" style={{ marginTop: 12 }}>
        <Fact label={`Allure à ${progression.referenceHeartRateBpm} bpm`} value={formatPace(progression.recent.speedAtReferenceHr).replace("/km", "")} unit="/km" sub={`avant : ${formatPace(progression.previous.speedAtReferenceHr)}`} />
        <Fact label="VO2max (montre)" value={formatNumber(progression.vo2max.latest, 1)} sub={progression.vo2max.delta != null ? `${progression.vo2max.delta >= 0 ? "+" : "−"}${formatNumber(Math.abs(progression.vo2max.delta), 1)} en ${progression.windowWeeks} sem.` : undefined} />
        <Fact label="Sorties faciles mesurées" value={String(progression.recent.runs)} sub={`contre ${progression.previous.runs} sur la période d'avant`} />
      </div>
    </section>
  );
}

/* ---------- Forme et récupération ---------- */
function Kpi({ icon, question, value, unit, compare, meaning, tone, chart, index }: { icon: React.ReactNode; question: string; value: string; unit?: string; compare: string; meaning: string; tone: Tone; chart: React.ReactNode; index: number }) {
  return (
    <div className="card kpi rise" style={{ ["--i" as string]: index }}>
      <div className="kpi-question">{icon}{question}</div>
      <div className="kpi-value">{value}{unit && value !== "—" ? <span className="unit">{unit}</span> : null}</div>
      <div className="kpi-compare num">{compare}</div>
      <div className="kpi-meaning"><ToneDot tone={tone} />{meaning}</div>
      {chart}
    </div>
  );
}

export function RecoveryRow({ dashboard }: { dashboard: Dashboard }) {
  const { load, recovery } = dashboard;
  const loadInfo = loadMeaning(load);
  const hrvInfo = hrvMeaning(recovery);
  const sleepInfo = sleepMeaning(recovery);
  const rhrInfo = restingHrMeaning(recovery);
  return (
    <div className="grid grid-4">
      <Kpi
        index={2}
        icon={<Waves size={14} />}
        question="Ma charge est-elle raisonnable ?"
        value={String(load.acute7d)}
        unit="charge Garmin, 7 j"
        compare={load.ratio != null ? `contre ${load.chronicWeekly28d} par semaine en moyenne (×${formatNumber(load.ratio, 1)})` : "—"}
        meaning={loadInfo.text}
        tone={loadInfo.tone}
        chart={<SparkBars points={load.weeks.map((week) => ({ label: formatDate(week.weekStart, "short"), value: week.load }))} unit="de charge Garmin" />}
      />
      <Kpi index={3} icon={<HeartPulse size={14} />} question="Ma VFC est-elle normale ?" value={recovery.hrv.latest != null ? String(Math.round(recovery.hrv.latest)) : "—"} unit="ms cette nuit" compare={hrvCompare(recovery)} meaning={hrvInfo.text} tone={hrvInfo.tone} chart={<Sparkline points={recovery.hrv.series} unit="ms" />} />
      <Kpi index={4} icon={<Moon size={14} />} question="Ai-je assez dormi ?" value={recovery.sleep.latest != null ? formatDuration(recovery.sleep.latest) : "—"} compare={sleepCompare(recovery)} meaning={sleepInfo.text} tone={sleepInfo.tone} chart={<Sparkline points={recovery.sleep.series} unit="" format="duration" />} />
      <Kpi index={5} icon={<HeartPulse size={14} />} question="Ma FC de repos ?" value={recovery.restingHr.latest != null ? String(Math.round(recovery.restingHr.latest)) : "—"} unit="bpm" compare={restingHrCompare(recovery)} meaning={rhrInfo.text} tone={rhrInfo.tone} chart={<Sparkline points={recovery.restingHr.series} unit="bpm" />} />
    </div>
  );
}

/* ---------- Dernière séance ---------- */
export function LastSessionCard({ dashboard, coach }: { dashboard: Dashboard; coach: CoachResult<SessionCoachOutput> | null }) {
  const last = dashboard.lastRun;
  if (!last) return <div className="card"><p className="muted">Aucune course analysée pour l&apos;instant.</p></div>;
  const { activity, metrics, verdict } = last;
  const tone = VERDICT_TONES[verdict.level];
  const ready = coach?.status === "ready" ? coach.output : null;
  const wentWell = ready?.wentWell ?? verdict.wentWell;
  const toWork = ready?.toWork ?? verdict.toWork;
  const href = `/activities/${encodeURIComponent(activity.id)}`;
  return (
    <section className="card rise" style={{ ["--i" as string]: 6 }} aria-labelledby="last-title">
      <div className="row-between" style={{ flexWrap: "wrap" }}>
        <div className="row">
          <SessionGlyph family={familyOfKind(metrics.kind)} />
          <div>
            <div className="card-eyebrow">Dernière séance · {formatDate(activity.localDate, "long")}</div>
            <h2 id="last-title" className="card-title" style={{ fontSize: 26, marginTop: 2 }}>{sessionTitle(metrics)}</h2>
          </div>
        </div>
        <Badge tone={tone.tone} icon={tone.icon} label={`${VERDICT_LABELS[verdict.level]}${last.deltas.count ? ` · ${last.deltas.count} comparable${last.deltas.count > 1 ? "s" : ""}` : ""}`} />
      </div>
      <p className="verdict-line">{ready ? ready.verdict : verdict.headline}</p>
      <div className="facts">
        <Fact label="Distance" value={activity.distanceM ? formatNumber(activity.distanceM / 1000, 2) : "—"} unit="km" />
        <Fact label="Durée" value={formatDuration(activity.movingTimeS)} />
        <Fact label="Allure moy." value={formatPace(activity.averageSpeedMps).replace("/km", "")} unit="/km" />
        <Fact label="FC moy." value={activity.averageHeartRateBpm ? String(Math.round(activity.averageHeartRateBpm)) : "—"} unit="bpm" />
      </div>
      {wentWell || toWork ? (
        <div className="two-points">
          {wentWell ? <div className="point point-good"><div className="point-label"><ThumbsUp size={12} /> Bien fait</div>{wentWell}</div> : null}
          {toWork ? <div className="point point-work"><div className="point-label"><Wrench size={12} /> À travailler</div>{toWork}</div> : null}
        </div>
      ) : null}
      <div className="row-between" style={{ alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        {ready && coach?.status === "ready" ? <span className="muted small"><CoachStamp model={coach.model} createdAt={coach.createdAt} />{verdict.fewComparables ? " · comparaison fragile (moins de 3 séances comparables)" : ""}</span> : <CoachRequest endpoint={`/api/activities/${encodeURIComponent(activity.id)}/coach`} label="Demander l'analyse du coach" initialError={coach?.status === "error" ? coach.message : null} />}
        <Link href={href} className="btn btn-primary">Voir la séance <ArrowRight size={14} /></Link>
      </div>
    </section>
  );
}

/* ---------- Volume, intensité et séances récentes ---------- */
export function VolumeCard({ dashboard }: { dashboard: Dashboard }) {
  const { weeks } = dashboard.load;
  const total = weeks.reduce((sum, week) => sum + week.runKm, 0);
  return (
    <section className="card rise" style={{ ["--i" as string]: 7 }}>
      <div className="section-head">
        <h2 className="section-title">Volume de course, 12 semaines</h2>
        <span className="section-note num">{formatNumber(total / weeks.length, 1)} km/sem en moyenne</span>
      </div>
      <WeeklyVolumeChart weeks={weeks} />
    </section>
  );
}

export function IntensityCard({ dashboard }: { dashboard: Dashboard }) {
  const intensity = dashboard.load.intensity28d;
  const weeks = dashboard.load.weeks.slice(-8);
  return (
    <section className="card rise" style={{ ["--i" as string]: 8 }}>
      <div className="section-head">
        <h2 className="section-title">Comment je répartis mon intensité ?</h2>
        <span className="section-note">temps par zone FC, toutes activités</span>
      </div>
      {intensity ? (
        <>
          <div className="split-bar" aria-label="Répartition sur 4 semaines">
            <span style={{ width: `${intensity.low * 100}%`, background: "var(--zone-2)" }} />
            <span style={{ width: `${intensity.moderate * 100}%`, background: "var(--zone-3)" }} />
            <span style={{ width: `${intensity.high * 100}%`, background: "var(--zone-5)" }} />
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            <span><span className="legend-swatch" style={{ background: "var(--zone-2)" }} />Facile Z1–Z2 <strong className="num">{Math.round(intensity.low * 100)} %</strong></span>
            <span><span className="legend-swatch" style={{ background: "var(--zone-3)" }} />Modéré Z3 <strong className="num">{Math.round(intensity.moderate * 100)} %</strong></span>
            <span><span className="legend-swatch" style={{ background: "var(--zone-5)" }} />Intense Z4–Z5 <strong className="num">{Math.round(intensity.high * 100)} %</strong></span>
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>Sur 4 semaines ({formatDuration(intensity.totalMinutes * 60)}). Repère courant pour progresser en endurance : environ 80 % facile.</p>
          <IntensityChart weeks={weeks.map((week) => ({ label: formatDate(week.weekStart, "short"), low: week.lowMin, moderate: week.moderateMin, high: week.highMin }))} />
        </>
      ) : <p className="muted">Pas de données de FC sur les 4 dernières semaines.</p>}
    </section>
  );
}

export function RecentList({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section className="card rise" style={{ ["--i" as string]: 9 }}>
      <div className="section-head">
        <h2 className="section-title">Séances récentes</h2>
        <span className="section-note">{dashboard.activityCount} activités synchronisées</span>
      </div>
      <div className="list">
        {dashboard.recent.map((activity) => {
          const family = familyOfKind(activity.kind);
          return (
            <Link key={activity.id} href={`/activities/${encodeURIComponent(activity.id)}`} className="list-row">
              <SessionGlyph family={family} sport={activity.sport} size="sm" />
              <span style={{ minWidth: 0 }}>
                <span className="list-title">{activity.title ?? SPORT_LABELS[activity.sport as Sport] ?? activity.sport}</span>
                <span className="list-sub">{formatDate(activity.localDate, "short")} · {formatDuration(activity.movingTimeS)}{family === "other" ? "" : ` · ${FAMILY_STYLE[family].label}`}</span>
              </span>
              <span className="list-metric">
                {activity.distanceM ? formatDistance(activity.distanceM, 1) : "—"}
                <small>{activity.kind && activity.averageSpeedMps ? formatPace(activity.averageSpeedMps) : activity.averageHeartRateBpm ? `${Math.round(activity.averageHeartRateBpm)} bpm` : ""}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
