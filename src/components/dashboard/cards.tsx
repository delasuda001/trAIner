import { ArrowRight, CalendarClock, Gauge, HeartPulse, Moon, Sparkles, Waves } from "lucide-react";
import Link from "next/link";
import { CoachRequest } from "@/components/coach-request";
import { ProgressionChart, SparkBars, Sparkline, WeeklyVolumeChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Fact } from "@/components/ui/fact";
import type { OutlookCoachOutput } from "@/lib/coach/outlook-coach";
import type { SessionCoachOutput } from "@/lib/coach/session-coach";
import { SESSION_KIND_LABELS, type SessionKind } from "@/lib/engine/activity-metrics";
import { CONFIDENCE_LABELS, hrvCompare, hrvMeaning, loadMeaning, PROGRESSION_LABELS, progressionSentence, restingHrCompare, restingHrMeaning, sleepCompare, sleepMeaning, type Tone } from "@/lib/engine/explain";
import { SPORT_LABELS, VERDICT_TONES } from "@/lib/engine/labels";
import { VERDICT_LABELS } from "@/lib/engine/verdict";
import { formatDate, formatDistance, formatDuration, formatNumber, formatPace, formatRelativeDays } from "@/lib/formatters";
import type { Dashboard } from "@/lib/server/analytics";
import type { CoachResult } from "@/lib/server/coach-service";
import type { Sport } from "@/lib/source/types";

function ToneDot({ tone }: { tone: Tone }) {
  const color = tone === "good" ? "var(--good)" : tone === "warning" ? "var(--warning)" : tone === "critical" ? "var(--critical)" : "var(--text-3)";
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: color, display: "inline-block", flex: "none", marginTop: 5 }} />;
}

/* ---------- Prochaine séance ---------- */
export function SuggestionCard({ dashboard, coach }: { dashboard: Dashboard; coach: CoachResult<OutlookCoachOutput> }) {
  const { suggestion } = dashboard;
  const { primary, facts } = suggestion;
  const target = primary.target;
  const ready = coach.status === "ready" ? coach.output : null;
  return (
    <section className="card card-hero" aria-labelledby="next-title">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div className="card-eyebrow"><CalendarClock size={14} /> Prochaine séance</div>
        <Badge tone="accent" label={suggestion.when.label} icon="calendar" />
      </div>
      <h2 id="next-title" className="card-title">{primary.title}</h2>
      <div className="target">
        <span className="pill num">{formatDuration(primary.durationMin * 60)}</span>
        {target ? <span className="pill pill-accent num">{target.zone} · {target.heartRateLow}–{target.heartRateHigh} bpm</span> : null}
        {target?.paceSlowMps && target.paceFastMps ? <span className="pill num">{formatPace(target.paceSlowMps).replace("/km", "")}–{formatPace(target.paceFastMps)}</span> : null}
      </div>
      <p className="structure">{primary.structure}</p>
      {ready ? (
        <>
          <p className="coach-line"><span className="coach-tag">Pourquoi maintenant</span>{ready.suggestionWhy}</p>
          <p className="coach-line"><span className="coach-tag">Pour la réussir</span>{ready.executionTip}</p>
        </>
      ) : (
        <p className="coach-line"><span className="coach-tag">Pourquoi maintenant</span>{suggestion.reason}</p>
      )}
      {suggestion.alternative ? (
        <p className="alt"><strong>Plan B · {suggestion.alternative.title}</strong> ({formatDuration(suggestion.alternative.durationMin * 60)}). {suggestion.alternative.reason}</p>
      ) : null}
      <div className="card-foot">
        {facts.daysSinceLastRun != null ? `Dernière course ${formatRelativeDays(facts.daysSinceLastRun)} (${facts.lastRunKind ? facts.lastRunKind.charAt(0).toLowerCase() + facts.lastRunKind.slice(1) : ""})` : "Aucune course récente"}
        {" · "}
        {formatNumber(facts.runsPerWeek8w, 1)} course{facts.runsPerWeek8w >= 2 ? "s" : ""}/semaine sur 8 semaines
      </div>
    </section>
  );
}

/* ---------- Progression ---------- */
export function ProgressionCard({ dashboard, coach }: { dashboard: Dashboard; coach: CoachResult<OutlookCoachOutput> }) {
  const { progression } = dashboard;
  const state = PROGRESSION_LABELS[progression.state];
  const gain = progression.paceGainSPerKm;
  const sentence = coach.status === "ready" ? coach.output.progressionSentence : progressionSentence(progression);
  const toPace = (speed: number | null) => (speed ? 1000 / speed : null);
  return (
    <section className="card card-hero" aria-labelledby="progress-title">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div className="card-eyebrow"><Gauge size={14} /> Progression aérobie</div>
        <Badge tone={state.tone} label={state.label} icon={progression.state === "progressing" ? "up" : progression.state === "regressing" ? "down" : progression.state === "insufficient" ? "none" : "neutral"} />
      </div>
      <h2 id="progress-title" className="sr-only" style={{ position: "absolute", left: -9999 }}>Progression</h2>
      {progression.state !== "insufficient" && gain != null ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <div className="big-number num">
            {formatPace(progression.recent.speedAtReferenceHr).replace("/km", "")}
            <span className="unit">/km à {progression.referenceHeartRateBpm} bpm</span>
          </div>
          <span className="pill num" title="Écart avec la période précédente, à FC égale">
            {gain === 0 ? "même allure" : `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"}`} vs {progression.windowWeeks} sem. avant
          </span>
          <span className="muted small">confiance {progression.confidence ? CONFIDENCE_LABELS[progression.confidence] : "—"}</span>
        </div>
      ) : (
        <div className="big-number" style={{ marginTop: 8, fontSize: 22 }}>Tendance non mesurable pour l&apos;instant</div>
      )}
      <p className="card-text">{sentence}</p>
      <ProgressionChart
        points={progression.points.map((point) => ({ date: point.date, secondsPerKm: 1000 / point.speedAtReferenceHr }))}
        recentStart={progression.recent.start}
        recentLevel={toPace(progression.recent.speedAtReferenceHr)}
        previousLevel={toPace(progression.previous.speedAtReferenceHr)}
        referenceHr={progression.referenceHeartRateBpm}
      />
      <div className="legend" style={{ marginTop: 6 }}>
        <span><span className="legend-swatch" style={{ background: "var(--accent)" }} />{progression.windowWeeks} dernières semaines</span>
        <span><span className="legend-swatch" style={{ background: "var(--series-muted)" }} />Avant</span>
        <span className="muted">Pointillés : médiane de chaque période · 1 point = 1 sortie facile</span>
      </div>
      <div className="facts" style={{ marginTop: 14 }}>
        <Fact label="VO2max (montre)" value={formatNumber(progression.vo2max.latest, 1)} sub={progression.vo2max.delta != null ? `${progression.vo2max.delta >= 0 ? "+" : "−"}${formatNumber(Math.abs(progression.vo2max.delta), 1)} sur ${progression.windowWeeks} sem.` : undefined} />
        <Fact label="Volume course" value={formatNumber(progression.recent.runKmPerWeek, 1)} unit=" km/sem" sub={`avant : ${formatNumber(progression.previous.runKmPerWeek, 1)} km/sem`} />
        <Fact label="Sorties mesurées" value={`${progression.recent.runs} + ${progression.previous.runs}`} sub="récentes + avant" />
      </div>
      {progression.caveats.length && progression.state !== "insufficient" && coach.status !== "ready" ? <p className="notice small">{progression.caveats.join(" ")}</p> : null}
    </section>
  );
}

/* ---------- Forme et récupération ---------- */
function Kpi({ icon, question, value, unit, compare, meaning, tone, chart }: { icon: React.ReactNode; question: string; value: string; unit?: string; compare: string; meaning: string; tone: Tone; chart: React.ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-question" style={{ display: "flex", gap: 6, alignItems: "center" }}>{icon}{question}</div>
      <div className="kpi-value num">{value}{unit && value !== "—" ? <span className="unit">{unit}</span> : null}</div>
      <div className="kpi-compare num">{compare}</div>
      <div className="kpi-meaning" style={{ display: "flex", gap: 6 }}><ToneDot tone={tone} />{meaning}</div>
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
        icon={<Waves size={14} />}
        question="Ma charge est-elle raisonnable ?"
        value={String(load.acute7d)}
        unit="sur 7 j"
        compare={load.ratio != null ? `${formatNumber(load.ratio, 1)} × ta moyenne hebdo (${load.chronicWeekly28d})` : "—"}
        meaning={loadInfo.text}
        tone={loadInfo.tone}
        chart={<SparkBars points={load.weeks.map((week) => ({ label: formatDate(week.weekStart, "short"), value: week.load }))} unit="de charge" />}
      />
      <Kpi icon={<HeartPulse size={14} />} question="Ma VFC est-elle normale ?" value={recovery.hrv.latest != null ? String(Math.round(recovery.hrv.latest)) : "—"} unit="ms" compare={hrvCompare(recovery)} meaning={hrvInfo.text} tone={hrvInfo.tone} chart={<Sparkline points={recovery.hrv.series} unit="ms" />} />
      <Kpi icon={<Moon size={14} />} question="Ai-je assez dormi ?" value={recovery.sleep.latest != null ? formatDuration(recovery.sleep.latest) : "—"} compare={sleepCompare(recovery)} meaning={sleepInfo.text} tone={sleepInfo.tone} chart={<Sparkline points={recovery.sleep.series} unit="" format="duration" />} />
      <Kpi icon={<HeartPulse size={14} />} question="Ma FC de repos ?" value={recovery.restingHr.latest != null ? String(Math.round(recovery.restingHr.latest)) : "—"} unit="bpm" compare={restingHrCompare(recovery)} meaning={rhrInfo.text} tone={rhrInfo.tone} chart={<Sparkline points={recovery.restingHr.series} unit="bpm" />} />
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
  const href = `/activities/${encodeURIComponent(activity.id)}`;
  return (
    <section className="card" aria-labelledby="last-title">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div className="card-eyebrow">Dernière séance · {formatDate(activity.localDate, "long")}</div>
          <h2 id="last-title" className="card-title">{SESSION_KIND_LABELS[metrics.kind]}</h2>
        </div>
        <Badge tone={tone.tone} icon={tone.icon} label={`${VERDICT_LABELS[verdict.level]}${last.deltas.count ? ` (${last.deltas.count} comparables)` : ""}`} />
      </div>
      <p className="verdict-line">{ready ? ready.verdict : verdict.headline}</p>
      <div className="facts">
        <Fact label="Distance" value={formatDistance(activity.distanceM, 2).replace(/ km$/, "")} unit=" km" />
        <Fact label="Durée" value={formatDuration(activity.movingTimeS)} />
        <Fact label="Allure moy." value={formatPace(activity.averageSpeedMps).replace("/km", "")} unit="/km" />
        <Fact label="FC moy." value={activity.averageHeartRateBpm ? String(Math.round(activity.averageHeartRateBpm)) : "—"} unit=" bpm" />
      </div>
      <ul className="bullets">
        {(ready ? ready.bullets : verdict.signals.map((signal) => signal.label)).slice(0, 4).map((line) => <li key={line}>{line}</li>)}
      </ul>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        {ready ? <span className="muted small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Sparkles size={13} /> Analyse du coach</span> : <CoachRequest endpoint={`/api/activities/${encodeURIComponent(activity.id)}/coach`} label="Demander l'analyse du coach" initialError={coach?.status === "error" ? coach.message : null} />}
        <Link href={href} className="btn btn-primary">Voir la séance <ArrowRight size={14} /></Link>
      </div>
    </section>
  );
}

/* ---------- Volume et séances récentes ---------- */
export function VolumeCard({ dashboard }: { dashboard: Dashboard }) {
  const { weeks } = dashboard.load;
  const total = weeks.reduce((sum, week) => sum + week.runKm, 0);
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Volume de course, 12 semaines</h2>
        <span className="section-note num">{formatNumber(total / weeks.length, 1)} km/sem en moyenne</span>
      </div>
      <WeeklyVolumeChart weeks={weeks} />
    </section>
  );
}

export function RecentList({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Séances récentes</h2>
        <span className="section-note">{dashboard.activityCount} activités synchronisées</span>
      </div>
      <div className="list">
        {dashboard.recent.map((activity) => (
          <Link key={activity.id} href={`/activities/${encodeURIComponent(activity.id)}`} className="list-row">
            <span className="list-date num">{formatDate(activity.localDate, "short")}</span>
            <span style={{ minWidth: 0 }}>
              <span className="list-title" style={{ display: "block" }}>{activity.kind ? SESSION_KIND_LABELS[activity.kind as SessionKind] : SPORT_LABELS[activity.sport as Sport] ?? activity.sport}</span>
              <span className="list-sub">{SPORT_LABELS[activity.sport as Sport] ?? activity.sport} · {formatDuration(activity.movingTimeS)}</span>
            </span>
            <span className="list-metric num">
              {activity.distanceM ? formatDistance(activity.distanceM, 1) : "—"}
              <small>{activity.kind && activity.averageSpeedMps ? formatPace(activity.averageSpeedMps) : activity.averageHeartRateBpm ? `${Math.round(activity.averageHeartRateBpm)} bpm` : ""}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
