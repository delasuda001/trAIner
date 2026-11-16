import { ChevronRight, Sparkles, ThumbsUp, Wrench } from "lucide-react";
import Link from "next/link";
import { ComparisonChart, SessionStreamCharts } from "@/components/charts";
import { CoachRequest } from "@/components/coach-request";
import { Badge } from "@/components/ui/badge";
import { Fact } from "@/components/ui/fact";
import type { SessionCoachOutput } from "@/lib/coach/session-coach";
import { SESSION_KIND_LABELS, type SessionKind } from "@/lib/engine/activity-metrics";
import { SPORT_LABELS, VERDICT_TONES } from "@/lib/engine/labels";
import { VERDICT_LABELS } from "@/lib/engine/verdict";
import { ZONE_LABELS, zoneRange } from "@/lib/engine/zones";
import { formatClock, formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import type { ActivityView as View, SessionAnalysis } from "@/lib/server/analytics";
import type { CoachResult } from "@/lib/server/coach-service";
import type { Sport } from "@/lib/source/types";

function bpm(value: number | null | undefined) {
  return value == null ? "—" : String(Math.round(value));
}

function signed(value: number, unit: string, positiveWord: string, negativeWord: string) {
  if (value === 0) return `identique`;
  return `${formatNumber(Math.abs(value))} ${unit} plus ${value > 0 ? positiveWord : negativeWord}`;
}

function CoachCard({ analysis, coach }: { analysis: SessionAnalysis; coach: CoachResult<SessionCoachOutput> | null }) {
  const { verdict, activity, deltas } = analysis;
  const tone = VERDICT_TONES[verdict.level];
  const ready = coach?.status === "ready" ? coach.output : null;
  const wentWell = ready?.wentWell ?? verdict.wentWell;
  const toWork = ready?.toWork ?? verdict.toWork;
  return (
    <section className="card card-hero" aria-label="Verdict du coach">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Badge tone={tone.tone} icon={tone.icon} label={`${VERDICT_LABELS[verdict.level]}${deltas.count ? ` · ${deltas.count} séances comparables` : ""}`} />
        {ready && coach?.status === "ready" ? <span className="muted small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Sparkles size={13} /> Coach Claude · {formatDate(coach.createdAt, "medium")}</span> : null}
      </div>
      <p className="verdict-line">{ready ? ready.verdict : verdict.headline}</p>
      <ul className="bullets">
        {(ready ? ready.bullets : verdict.signals.map((signal) => signal.label).filter((label) => label !== verdict.wentWell && label !== verdict.toWork)).map((line) => <li key={line}>{line}</li>)}
      </ul>
      {wentWell || toWork ? (
        <div className="two-points">
          {wentWell ? <div className="point point-good"><div className="point-label"><ThumbsUp size={12} /> Bien fait</div>{wentWell}</div> : null}
          {toWork ? <div className="point point-work"><div className="point-label"><Wrench size={12} /> À travailler</div>{toWork}</div> : null}
        </div>
      ) : null}
      {ready ? (
        <details className="more">
          <summary><ChevronRight size={14} className="chev" /> Analyse détaillée</summary>
          <p className="more-body">{ready.detail}</p>
        </details>
      ) : (
        <div style={{ marginTop: 16 }}>
          <CoachRequest endpoint={`/api/activities/${encodeURIComponent(activity.id)}/coach`} label="Demander l'analyse du coach" initialError={coach?.status === "error" ? coach.message : null} />
          <p className="muted small" style={{ marginTop: 6 }}>Verdict ci-dessus calculé à partir de tes données ; Claude le commente et l&apos;explique.</p>
        </div>
      )}
    </section>
  );
}

function ComparisonCard({ analysis }: { analysis: SessionAnalysis }) {
  const { deltas, comparables, metrics, activity } = analysis;
  if (deltas.count === 0) {
    return (
      <section className="card">
        <h2 className="section-title">Comparaison</h2>
        <p className="card-text">Pas encore de séance comparable (même type, durée et dénivelé proches, moins de 18 mois) : celle-ci servira de repère.</p>
      </section>
    );
  }
  const intervals = metrics.structure === "intervals" && metrics.work;
  const currentSpeed = intervals ? metrics.work?.averageSpeedMps : metrics.mainSpeedMps;
  const currentHr = intervals ? metrics.work?.averageHeartRateBpm : metrics.mainHeartRateBpm;
  const rows = [
    ...(currentSpeed ? [{ label: "Cette séance", secondsPerKm: 1000 / currentSpeed, heartRate: currentHr ?? null, current: true }] : []),
    ...comparables
      .map((run) => ({ run, speed: intervals ? run.workSpeedMps : run.mainSpeedMps, hr: intervals ? run.workHeartRateBpm : run.mainHeartRateBpm }))
      .filter((entry) => entry.speed)
      .map((entry) => ({ label: formatDate(entry.run.localDate, "short") + (entry.run.localDate.slice(0, 4) !== activity.localDate.slice(0, 4) ? ` ${entry.run.localDate.slice(2, 4)}` : ""), secondsPerKm: 1000 / (entry.speed as number), heartRate: entry.hr, current: false })),
  ];
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Face à tes séances comparables</h2>
        <span className="section-note">{intervals ? "allure des répétitions" : "allure hors échauffement"}</span>
      </div>
      <ComparisonChart rows={rows} metricLabel={intervals ? "Répétitions" : "Allure"} />
      <div className="facts" style={{ marginTop: 12 }}>
        {deltas.paceAtEqualHrGainSPerKm != null ? <Fact label="Allure à FC égale" value={signed(deltas.paceAtEqualHrGainSPerKm, "s/km", "rapide", "lent")} /> : null}
        {deltas.hrAtEqualPaceDeltaBpm != null ? <Fact label="FC à allure égale" value={signed(deltas.hrAtEqualPaceDeltaBpm, "bpm", "haute", "basse")} /> : null}
        {deltas.drift.current != null ? <Fact label="Dérive cardiaque" value={`${formatNumber(deltas.drift.current, 1)} %`} sub={deltas.drift.reference != null ? `comparables : ${formatNumber(deltas.drift.reference, 1)} %` : undefined} /> : null}
        {deltas.fade.current != null ? <Fact label="2e moitié vs 1re" value={`${formatNumber(Math.abs(deltas.fade.current), 1)} % plus ${deltas.fade.current > 0 ? "lente" : "rapide"}`} sub={deltas.fade.reference != null ? `comparables : ${formatNumber(Math.abs(deltas.fade.reference), 1)} % plus ${deltas.fade.reference > 0 ? "lente" : "rapide"}` : undefined} /> : null}
        {deltas.work?.current?.speedCvPct != null ? <Fact label="Écart entre reps" value={`${formatNumber(deltas.work.current.speedCvPct, 1)} %`} sub={deltas.work.reference?.speedCvPct != null ? `comparables : ${formatNumber(deltas.work.reference.speedCvPct, 1)} %` : undefined} /> : null}
      </div>
      <details className="more">
        <summary><ChevronRight size={14} className="chev" /> Les {deltas.count} séances retenues</summary>
        <div className="list more-body">
          {comparables.map((run) => (
            <Link key={run.id} href={`/activities/${encodeURIComponent(run.id)}`} className="list-row">
              <span className="list-date num">{formatDate(run.localDate, "short")}</span>
              <span className="list-title">{SESSION_KIND_LABELS[run.kind as SessionKind] ?? run.kind}</span>
              <span className="list-metric num">{formatDistance(run.distanceM, 1)}<small>{formatDuration(run.movingTimeS)}</small></span>
            </Link>
          ))}
        </div>
      </details>
    </section>
  );
}

function LapsCard({ view }: { view: View }) {
  const laps = view.laps.filter((lap) => lap.durationS >= 10);
  if (laps.length < 2) return null;
  const workIndexes = new Set<number>();
  const work = view.analysis?.metrics.work;
  if (work) {
    const cut = Math.min(...work.repsDetail.map((rep) => rep.speedMps)) - 0.001;
    laps.forEach((lap) => { if ((lap.averageSpeedMps ?? 0) >= cut) workIndexes.add(lap.index); });
  }
  const fastest = Math.max(...laps.map((lap) => lap.averageSpeedMps ?? 0));
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Laps</h2>
        <span className="section-note">{work ? "en gras : répétitions détectées" : `${laps.length} laps`}</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>#</th><th>Durée</th><th>Distance</th><th>Allure</th><th className="bar-cell">Vitesse relative</th><th>FC moy.</th><th>FC max</th></tr></thead>
          <tbody>
            {laps.map((lap) => (
              <tr key={lap.index} className={workIndexes.has(lap.index) ? "is-work" : undefined}>
                <td>{lap.index + 1}</td>
                <td>{formatClock(lap.durationS)}</td>
                <td>{lap.distanceM ? formatDistance(lap.distanceM, 2) : "—"}</td>
                <td>{formatPace(lap.averageSpeedMps)}</td>
                <td className="bar-cell"><div className={`lap-bar${workIndexes.has(lap.index) ? " work" : ""}`} style={{ width: `${Math.max(4, ((lap.averageSpeedMps ?? 0) / fastest) * 100)}%` }} /></td>
                <td>{bpm(lap.averageHeartRateBpm)}</td>
                <td>{bpm(lap.maxHeartRateBpm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ZonesCard({ view }: { view: View }) {
  const shares = view.analysis?.metrics.zoneShares ?? (view.activity.hrTimeInZonesJson ? (() => {
    const seconds = JSON.parse(view.activity.hrTimeInZonesJson as string) as number[];
    const total = seconds.reduce((sum, value) => sum + value, 0);
    return total > 0 ? seconds.map((value) => value / total) : null;
  })() : null);
  if (!shares) return null;
  const zones = view.profile.zones;
  const minutes = (view.activity.movingTimeS ?? 0) / 60;
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Temps par zone FC</h2>
        <span className="section-note">{view.profile.zonesFromWatch ? "zones de ta montre" : "zones estimées"}</span>
      </div>
      <div className="zones">
        {([1, 2, 3, 4, 5] as const).map((zone) => {
          const [low, high] = zoneRange(zone, zones);
          const share = shares[zone - 1] ?? 0;
          return (
            <div className="zone-row" key={zone} title={`${Math.round(share * minutes)} min`}>
              <span>{ZONE_LABELS[zone]} <span className="muted small num">{low}–{high}</span></span>
              <div className="zone-track"><div className="zone-fill" style={{ width: `${share * 100}%`, background: `var(--zone-${zone})` }} /></div>
              <span className="zone-pct">{Math.round(share * 100)} %</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DetailTable({ analysis }: { analysis: SessionAnalysis }) {
  const { metrics } = analysis;
  const rows: Array<[string, string]> = [];
  rows.push(["Allure / FC hors 5 premières minutes", `${formatPace(metrics.mainSpeedMps)} · ${bpm(metrics.mainHeartRateBpm)} bpm`]);
  if (metrics.halves) {
    rows.push(["1re moitié", `${formatPace(metrics.halves.first.speedMps)} · ${bpm(metrics.halves.first.heartRateBpm)} bpm`]);
    rows.push(["2e moitié", `${formatPace(metrics.halves.second.speedMps)} · ${bpm(metrics.halves.second.heartRateBpm)} bpm`]);
  }
  if (metrics.aerobic) rows.push(["Portions stables en Z2–Z3", `${metrics.aerobic.minutes} min à ${formatPace(metrics.aerobic.speedMps)} · ${bpm(metrics.aerobic.heartRateBpm)} bpm`]);
  metrics.blocks?.forEach((block) => rows.push([`${formatNumber(block.fromKm, 1)}–${formatNumber(block.toKm, 1)} km`, `${formatPace(block.speedMps)} · ${bpm(block.heartRateBpm)} bpm`]));
  metrics.work?.repsDetail.forEach((rep, index) => rows.push([`Répétition ${index + 1}`, `${formatClock(rep.durationS)} · ${formatPace(rep.speedMps)} · ${bpm(rep.heartRateBpm)} bpm (max ${bpm(rep.maxHeartRateBpm)})${rep.recoveryAfterS ? ` · récup ${formatClock(rep.recoveryAfterS)}` : ""}`]));
  if (metrics.elevationGainPerKm != null) rows.push(["Dénivelé par km", `${formatNumber(metrics.elevationGainPerKm, 1)} m`]);
  rows.push(["FC de repos de référence", `${metrics.restingHeartRateUsed} bpm`]);
  return (
    <table className="data">
      <tbody>{rows.map(([label, value]) => <tr key={label}><td className="muted">{label}</td><td>{value}</td></tr>)}</tbody>
    </table>
  );
}

export function ActivityView({ view, coach }: { view: View; coach: CoachResult<SessionCoachOutput> | null }) {
  const { activity, analysis } = view;
  const sport = SPORT_LABELS[activity.sport as Sport] ?? activity.sport;
  const title = analysis ? SESSION_KIND_LABELS[analysis.metrics.kind] : sport;
  const time = activity.startTimeLocal.slice(11, 16).replace(":", " h ");
  return (
    <>
      <div className="page-head" style={{ paddingTop: 12 }}>
        <div>
          <p className="muted">{formatDate(activity.localDate, "long")} · {time} · {sport}</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{activity.name}</p>
        </div>
      </div>

      <div className="card">
        <div className="facts" style={{ marginTop: 0 }}>
          <Fact label="Distance" value={activity.distanceM ? formatNumber(activity.distanceM / 1000, 2) : "—"} unit=" km" />
          <Fact label="Durée" value={formatClock(activity.movingTimeS)} />
          {activity.averageSpeedMps && activity.sport !== "swimming" ? <Fact label="Allure moy." value={formatPace(activity.averageSpeedMps).replace("/km", "")} unit="/km" /> : null}
          <Fact label="FC moy. / max" value={`${bpm(activity.averageHeartRateBpm)} / ${bpm(activity.maxHeartRateBpm)}`} unit=" bpm" />
          <Fact label="Dénivelé +" value={activity.elevationGainM != null ? String(Math.round(activity.elevationGainM)) : "—"} unit=" m" />
          {activity.averageCadenceSpm ? <Fact label="Cadence" value={String(Math.round(activity.averageCadenceSpm))} unit=" pas/min" /> : null}
          <Fact label="Charge (Garmin)" value={activity.trainingLoad != null ? String(Math.round(activity.trainingLoad)) : "—"} sub={activity.aerobicTrainingEffect != null ? `effet aérobie ${formatNumber(activity.aerobicTrainingEffect, 1)}` : undefined} />
        </div>
      </div>

      {analysis ? (
        <div className="grid grid-main-side section" style={{ alignItems: "start" }}>
          <CoachCard analysis={analysis} coach={coach} />
          <ComparisonCard analysis={analysis} />
        </div>
      ) : (
        <p className="notice">Analyse coach réservée aux courses ; résumé Garmin affiché pour les autres sports.</p>
      )}

      {view.chart.length ? (
        <section className="card section">
          <div className="section-head">
            <h2 className="section-title">Allure et fréquence cardiaque</h2>
            <span className="section-note">survole pour lire les valeurs</span>
          </div>
          <SessionStreamCharts points={view.chart} zoneFloors={view.profile.zones.floors} />
        </section>
      ) : null}

      <div className="grid grid-main-side section" style={{ alignItems: "start" }}>
        <LapsCard view={view} />
        <ZonesCard view={view} />
      </div>

      {analysis ? (
        <section className="card section">
          <details className="more" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <summary><ChevronRight size={14} className="chev" /> Toutes les données calculées</summary>
            <div className="more-body table-wrap"><DetailTable analysis={analysis} /></div>
          </details>
        </section>
      ) : null}
    </>
  );
}
