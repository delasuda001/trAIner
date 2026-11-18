import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ComparisonChart, SessionStreamCharts } from "@/components/charts";
import { CoachRequest } from "@/components/coach-request";
import { CoachStamp } from "@/components/ui/coach-stamp";
import { RateCoach } from "@/components/feedback/rate-coach";
import { FeelingForm } from "./feeling-form";
import { SessionPoints } from "./session-points";
import { Badge } from "@/components/ui/badge";
import { Fact } from "@/components/ui/fact";
import { SESSION_PROMPT_VERSION, type SessionCoachOutput } from "@/lib/coach/session-coach";
import { INTERVAL_INTENSITY_LABELS, paceSeconds, sessionTitle } from "@/lib/engine/activity-metrics";
import { readDynamics } from "@/lib/engine/dynamics-reading";
import { dominantZone, familyOfKind, SessionGlyph } from "@/components/ui/session-type";
import { SPORT_LABELS, VERDICT_TONES } from "@/lib/engine/labels";
import { VERDICT_LABELS } from "@/lib/engine/verdict";
import { ZONE_LABELS, zoneRange } from "@/lib/engine/zones";
import { formatClock, formatDate, formatDistance, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import type { ActivityView as View, SessionAnalysis } from "@/lib/server/analytics";
import type { CoachResult } from "@/lib/server/coach-service";
import type { Sport } from "@/lib/source/types";
import { Say } from "@/components/ui/register";
import { compactLaps } from "@/lib/activity/laps-view";

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
  // Analyse à jour, ou à défaut la précédente (données modifiées depuis : ressenti, nouvelles séances…).
  const previous = coach?.status === "missing" ? coach.previous ?? null : null;
  const shown = coach?.status === "ready" ? coach : previous;
  const ready = shown ? shown.output : null;
  const endpoint = `/api/activities/${encodeURIComponent(activity.id)}/coach`;
  return (
    <section className="card card-hero" style={{ ["--shadow-color" as string]: "var(--sl-pink)" }} aria-label="Verdict du coach">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Badge tone={tone.tone} icon={tone.icon} label={<Say tu={`${VERDICT_LABELS[verdict.level]}${deltas.count ? ` · ${deltas.count} séances comparables` : ""}`} />} />
        {shown ? <CoachStamp model={shown.model} createdAt={shown.createdAt} /> : null}
      </div>
      {previous ? (
        <div className="stale-note">
          <span style={{ flex: "1 1 220px" }}><Say tu="Tes données ont changé depuis cette analyse (ressenti, nouvelles séances ou réglages du coach)." /></span>
          <CoachRequest endpoint={endpoint} label="Mettre à jour l'analyse" queueLabel={`Analyse de la séance du ${formatDate(activity.localDate, "short")}`} />
        </div>
      ) : null}
      <p className="verdict-line">{ready ? ready.verdict : verdict.headline}</p>
      <ul className="bullets">
        {(ready ? ready.bullets : verdict.signals.map((signal) => signal.label).filter((label) => label !== verdict.wentWell && label !== verdict.toWork)).map((line) => <li key={line}>{line}</li>)}
      </ul>
      <SessionPoints ready={ready} prescription={analysis.prescription} fallbackKeep={verdict.wentWell} />
      {ready?.goalLink ? <p className="goal-link"><strong><Say tu="Pour ton objectif" vous="Pour votre objectif" /> :</strong> {ready.goalLink}</p> : null}
      {ready ? (
        <details className="more">
          <summary><ChevronRight size={14} className="chev" /> Analyse détaillée</summary>
          <p className="more-body">{ready.detail}</p>
        </details>
      ) : null}
      {ready && coach?.status === "ready" ? <RateCoach subjectKind="session" subjectId={activity.id} promptVersion={SESSION_PROMPT_VERSION} label="Cette analyse t'est utile ?" /> : null}
      {ready ? null : (
        <div style={{ marginTop: 16 }}>
          <CoachRequest endpoint={endpoint} label="Demander l'analyse du coach" queueLabel={`Analyse de la séance du ${formatDate(activity.localDate, "short")}`} initialError={coach?.status === "error" ? coach.message : null} />
          <p className="muted small" style={{ marginTop: 6 }}><Say tu="Verdict ci-dessus calculé à partir de tes données ; Claude le commente et l'explique." /></p>
        </div>
      )}
    </section>
  );
}

function dynamicsRows(analysis: SessionAnalysis): Array<{ label: string; value: string; change: string; reference: string }> {
  const dynamics = analysis.metrics.dynamics;
  if (!dynamics) return [];
  const reference = analysis.deltas.dynamicsReference?.values;
  const rows: Array<{ key: keyof typeof dynamics.early; label: string; format: (value: number) => string; unit: string; delta: (a: number, b: number) => string }> = [
    { key: "cadenceSpm", label: "Cadence", format: (value) => `${value}`, unit: "pas/min", delta: (a, b) => `${b - a >= 0 ? "+" : "−"}${Math.abs(b - a)}` },
    { key: "stepLengthM", label: "Longueur de pas", format: (value) => formatNumber(value, 2), unit: "m", delta: (a, b) => `${b - a >= 0 ? "+" : "−"}${Math.round(Math.abs(b - a) * 100)} cm` },
    { key: "groundContactMs", label: "Contact au sol", format: (value) => `${value}`, unit: "ms", delta: (a, b) => `${b - a >= 0 ? "+" : "−"}${Math.abs(b - a)} ms` },
    { key: "verticalOscillationMm", label: "Oscillation verticale", format: (value) => formatNumber(value / 10, 1), unit: "cm", delta: (a, b) => `${b - a >= 0 ? "+" : "−"}${Math.abs(b - a)} mm` },
    { key: "verticalRatioPct", label: "Ratio vertical", format: (value) => formatNumber(value, 1), unit: "%", delta: (a, b) => `${b - a >= 0 ? "+" : "−"}${formatNumber(Math.abs(b - a), 1)} pt` },
  ];
  return rows.filter((row) => dynamics[row.key] != null).map((row) => {
    const value = dynamics[row.key] as number;
    const early = dynamics.early[row.key];
    const late = dynamics.late[row.key];
    const ref = reference?.[row.key];
    return { label: row.label, value: `${row.format(value)} ${row.unit}`, change: early != null && late != null ? row.delta(early, late) : "—", reference: ref != null ? `${row.format(ref)} ${row.unit}` : "—" };
  });
}

function DynamicsCard({ analysis }: { analysis: SessionAnalysis }) {
  const rows = dynamicsRows(analysis);
  if (!rows.length) return null;
  const reps = analysis.metrics.dynamics?.basis === "reps";
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Dynamique de course</h2>
        <span className="section-note">{reps ? "sur les répétitions" : "hors échauffement, portions courues"}</span>
      </div>
      <div className="table-wrap">
        <table className="data dyn-table">
          <thead><tr><th></th><th>Séance</th><th>{reps ? "1re → dernière rep" : "1re → 2e moitié"}</th><th>Comparables{analysis.deltas.dynamicsReference ? ` (${analysis.deltas.dynamicsReference.count})` : ""}</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.label}><td className="muted">{row.label}</td><td><strong>{row.value}</strong></td><td className="delta">{row.change}</td><td className="delta">{row.reference}</td></tr>)}</tbody>
        </table>
      </div>
      {readDynamics(analysis.metrics, analysis.deltas).length ? (
        <ul className="bullets" style={{ marginTop: 10 }}>{readDynamics(analysis.metrics, analysis.deltas).map((line) => <li key={line}><Say tu={line} /></li>)}</ul>
      ) : null}
      <p className="muted small" style={{ marginTop: 8 }}><Say tu="Comparé à tes propres valeurs uniquement, jamais à une norme." /></p>
    </section>
  );
}

function ContextCard({ analysis }: { analysis: SessionAnalysis }) {
  const { context } = analysis;
  const recovery = context.recovery;
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Contexte du jour</h2>
        <span className="section-note">au {formatDate(analysis.activity.localDate, "short")}, ce que le coach prend en compte</span>
      </div>
      <div className="facts" style={{ marginTop: 0 }}>
        <Fact label="Charge Garmin 7 j" value={String(context.acute7d)} sub={context.loadRatio != null ? `contre ${context.chronicWeekly28d}/sem. en moyenne` : undefined} />
        <Fact label="Course précédente" value={context.daysSincePreviousRun != null ? `${context.daysSincePreviousRun} j` : "—"} sub="avant" />
        <Fact label="Qualité sur 14 j" value={String(context.qualityBefore14d.length)} sub={context.qualityBefore14d.map((entry) => `${entry.daysBefore} j avant`).join(", ") || "aucune"} />
        <Fact label="VFC de la nuit" value={recovery.hrv.latest != null ? String(Math.round(recovery.hrv.latest)) : "—"} unit="ms" sub={recovery.hrv.baselineLow != null ? `plage ${recovery.hrv.baselineLow}–${recovery.hrv.baselineHigh}` : undefined} />
      </div>
    </section>
  );
}

function ageShort(days: number): string {
  if (days < 14) return `il y a ${days} j`;
  if (days < 60) return `il y a ${Math.round(days / 7)} sem.`;
  return `il y a ${Math.round(days / 30)} mois`;
}

function ComparisonCard({ analysis }: { analysis: SessionAnalysis }) {
  const { deltas, comparables, metrics } = analysis;
  if (deltas.count === 0) {
    return (
      <section className="card">
        <h2 className="section-title">Comparaison</h2>
        <p className="card-text">Pas de séance comparable récente (même type et même format, durée et dénivelé proches, moins d&apos;un an) : celle-ci servira de repère.</p>
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
      .map((entry) => ({ label: `${formatDate(entry.run.localDate, "short")} (${ageShort(entry.run.ageDays).replace("il y a ", "")})`, secondsPerKm: 1000 / (entry.speed as number), heartRate: entry.hr, current: false })),
  ];
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title"><Say tu="Face à tes séances comparables" /></h2>
        <span className="section-note">{intervals ? "allure des répétitions" : "allure hors échauffement"}</span>
      </div>
      {analysis.verdict.fewComparables ? <p className="notice small" style={{ marginTop: 0, marginBottom: 10 }}>Seulement {deltas.count} séance{deltas.count > 1 ? "" : ""} vraiment comparable{deltas.count > 1 ? "s" : ""} (même format, moins d&apos;un an) : comparaison fragile.</p> : null}
      {comparables.some((run) => run.nature === "family" || run.older) ? <p className="muted small" style={{ marginTop: 0, marginBottom: 10 }}>{comparables.some((run) => run.nature === "family") ? `Faute de séances au même format, comparaison élargie à la même famille (${metrics.work && metrics.work.averageDurationS <= 75 ? "fractionnés courts" : "fractionnés longs"}) : seules l'allure moyenne des répétitions et la FC se comparent. ` : ""}{comparables.some((run) => run.older) ? "Certaines séances ont plus d'un an." : ""}</p> : null}
      <ComparisonChart rows={rows} metricLabel={intervals ? "Répétitions" : "Allure"} />
      <div className="facts" style={{ marginTop: 12 }}>
        {deltas.paceAtEqualHrGainSPerKm != null ? <Fact label="Allure à FC égale" value={signed(deltas.paceAtEqualHrGainSPerKm, "s/km", "rapide", "lent")} /> : null}
        {deltas.hrAtEqualPaceDeltaBpm != null ? <Fact label="FC à allure égale" value={signed(deltas.hrAtEqualPaceDeltaBpm, "bpm", "haute", "basse")} /> : null}
        {deltas.drift.current != null ? <Fact label="Dérive cardiaque" value={`${formatNumber(deltas.drift.current, 1)} %`} sub={deltas.drift.reference != null ? `comparables : ${formatNumber(deltas.drift.reference, 1)} %` : undefined} /> : null}
        {deltas.fade.current != null ? <Fact label="2e moitié vs 1re" value={signed(deltas.fadeSPerKm.current ?? 0, "s/km", "lente", "rapide")} sub={deltas.fadeSPerKm.reference != null ? `comparables : ${signed(deltas.fadeSPerKm.reference, "s/km", "lente", "rapide")}` : undefined} /> : null}
        {metrics.work?.paceSpreadSPerKm != null ? <Fact label="Écart entre reps" value={`${metrics.work.paceSpreadSPerKm} s/km`} sub={deltas.work?.reference?.paceSpreadSPerKm != null ? `comparables : ${deltas.work.reference.paceSpreadSPerKm} s/km` : "entre la plus rapide et la plus lente"} /> : null}
        {deltas.work?.paceAtEqualHrGainSPerKm != null && metrics.work && deltas.work.reference?.speedMps ? <Fact label="Reps à FC égale" value={signed(deltas.work.paceAtEqualHrGainSPerKm, "s/km", "rapides", "lentes")} sub={`écart brut : ${signed(-(paceSeconds(metrics.work.averageSpeedMps) - paceSeconds(deltas.work.reference.speedMps)), "s/km", "rapides", "lentes")}`} /> : null}
      </div>
      <details className="more">
        <summary><ChevronRight size={14} className="chev" /> Les {deltas.count} séances retenues</summary>
        <div className="list more-body">
          {comparables.map((run) => (
            <Link key={run.id} href={`/activities/${encodeURIComponent(run.id)}`} className="list-row">
              <span className="list-date num">{formatDate(run.localDate, "short")}</span>
              <span><span className="list-title">{run.title}</span><span className="list-sub">{ageShort(run.ageDays)}{run.nature === "family" ? " · même famille, format différent" : ""}</span></span>
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
  // Fractionné : répétitions seules par défaut, le reste regroupé ; le détail complet se déplie.
  const compact = work ? compactLaps(laps, (lap) => workIndexes.has(lap.index)) : null;
  const bar = (speed: number | null, isWork: boolean) => <div className={`lap-bar${isWork ? " work" : ""}`} style={{ width: `${Math.max(4, ((speed ?? 0) / fastest) * 100)}%` }} />;
  const head = <thead><tr><th>#</th><th>Durée</th><th>Distance</th><th>Allure</th><th className="bar-cell">Vitesse relative</th><th>FC moy.</th><th>FC max</th></tr></thead>;
  const fullTable = (
    <div className="table-wrap">
      <table className="data">
        {head}
        <tbody>
          {laps.map((lap) => (
            <tr key={lap.index} className={workIndexes.has(lap.index) ? "is-work" : undefined}>
              <td>{lap.index + 1}</td>
              <td>{formatClock(lap.durationS)}</td>
              <td>{lap.distanceM ? formatDistance(lap.distanceM, 2) : "—"}</td>
              <td>{formatPace(lap.averageSpeedMps)}</td>
              <td className="bar-cell">{bar(lap.averageSpeedMps, workIndexes.has(lap.index))}</td>
              <td>{bpm(lap.averageHeartRateBpm)}</td>
              <td>{bpm(lap.maxHeartRateBpm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Laps</h2>
        <span className="section-note">{compact ? `${workIndexes.size} répétitions ; échauffement, récupérations et retour au calme regroupés` : work ? "en gras : répétitions détectées" : `${laps.length} laps`}</span>
      </div>
      {compact ? (
        <>
          <div className="table-wrap">
            <table className="data">
              {head}
              <tbody>
                {compact.map((row) => row.kind === "rep" ? (
                  <tr key={`rep-${row.lap.index}`} className="is-work">
                    <td>Rép. {row.number}</td>
                    <td>{formatClock(row.lap.durationS)}</td>
                    <td>{row.lap.distanceM ? formatDistance(row.lap.distanceM, 2) : "—"}</td>
                    <td>{formatPace(row.lap.averageSpeedMps)}</td>
                    <td className="bar-cell">{bar(row.lap.averageSpeedMps, true)}</td>
                    <td>{bpm(row.lap.averageHeartRateBpm)}</td>
                    <td>{bpm(row.lap.maxHeartRateBpm)}</td>
                  </tr>
                ) : (
                  <tr key={row.group.label} className="lap-group">
                    <td>{row.group.label}{row.group.count > 1 ? ` (${row.group.count})` : ""}</td>
                    <td>{row.group.count > 1 ? `${formatClock(row.group.durationS)} · moy. ${formatClock(Math.round(row.group.durationS / row.group.count))}` : formatClock(row.group.durationS)}</td>
                    <td>{row.group.distanceM ? formatDistance(row.group.distanceM, 2) : "—"}</td>
                    <td>{formatPace(row.group.speedMps)}</td>
                    <td className="bar-cell">{bar(row.group.speedMps, false)}</td>
                    <td>{bpm(row.group.heartRateBpm)}</td>
                    <td>{bpm(row.group.maxHeartRateBpm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="more">
            <summary><ChevronRight size={14} className="chev" /> Voir les {laps.length} tours</summary>
            <div className="more-body">{fullTable}</div>
          </details>
        </>
      ) : fullTable}
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
        <span className="section-note">{view.profile.zonesFromWatch ? <Say tu="zones de ta montre" /> : "zones estimées"}</span>
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
  const title = analysis ? sessionTitle(analysis.metrics) : sport;
  const intensity = analysis?.metrics.work ? INTERVAL_INTENSITY_LABELS[analysis.metrics.kind] : null;
  const family = analysis ? familyOfKind(analysis.metrics.kind) : "other";
  const time = activity.startTimeLocal.slice(11, 16).replace(":", " h ");
  const reps = analysis?.metrics.work?.repsDetail.map((rep) => ({ from: rep.startOffsetS, to: rep.startOffsetS + rep.durationS })) ?? [];
  return (
    <>
      <div className="page-head rise" style={{ paddingTop: 12 }}>
        <div className="row">
          <SessionGlyph family={family} zone={analysis ? dominantZone(analysis.metrics.zoneShares) : null} sport={activity.sport} />
          <div>
            <p className="eyebrow">{formatDate(activity.localDate, "long")} · {time} · {sport}</p>
            <h1 className="page-title">{title}</h1>
            <p className="page-sub">{intensity ? `${intensity.charAt(0).toUpperCase()}${intensity.slice(1)} · ` : ""}{activity.name}</p>
          </div>
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
          <SessionStreamCharts points={view.chart} zoneFloors={view.profile.zones.floors} reps={reps} />
        </section>
      ) : null}

      <div className="grid grid-main-side section" style={{ alignItems: "start" }}>
        <div className="stack">
          <LapsCard view={view} />
          {analysis ? <DynamicsCard analysis={analysis} /> : null}
        </div>
        <ZonesCard view={view} />
      </div>

      {analysis ? (
        <div className="grid grid-main-side section" style={{ alignItems: "start" }}>
          <FeelingForm activityId={activity.id} initial={analysis.feeling} />
          <ContextCard analysis={analysis} />
        </div>
      ) : null}

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
