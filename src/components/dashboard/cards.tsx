import { ArrowRight, Gauge, HeartPulse, Moon, Target, Waves } from "lucide-react";
import Link from "next/link";
import { SessionPoints } from "@/components/activity/session-points";
import { GoalStatusList } from "@/components/goal/goal-status";
import { CoachRequest } from "@/components/coach-request";
import { RateCoach } from "@/components/feedback/rate-coach";
import { IntensityChart, ProgressionChart, Sparkline, WeeklyVolumeChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { CoachStamp } from "@/components/ui/coach-stamp";
import { Fact } from "@/components/ui/fact";
import { dominantZone, familyOfKind, FAMILY_STYLE, SessionGlyph, SUGGESTION_ZONE, ZONE_NAMES, ZoneDot, zoneColor, type Zone } from "@/components/ui/session-type";
import type { OutlookCoachOutput } from "@/lib/coach/outlook-coach";
import type { SessionCoachOutput } from "@/lib/coach/session-coach";
import { daysBetween } from "@/lib/dates";
import { sessionTitle } from "@/lib/engine/activity-metrics";
import { CONFIDENCE_LABELS, hrvCompare, hrvMeaning, loadMeaning, progressionSentence, restingHrCompare, restingHrMeaning, sleepCompare, sleepMeaning, type Tone } from "@/lib/engine/explain";
import { SPORT_LABELS, VERDICT_TONES } from "@/lib/engine/labels";
import { VERDICT_LABELS } from "@/lib/engine/verdict";
import { formatDate, formatDuration, formatNumber, formatPace } from "@/lib/formatters";
import type { Dashboard } from "@/lib/server/analytics";
import type { CoachResult } from "@/lib/server/coach-service";
import type { Sport } from "@/lib/source/types";

const TONE_COLOR: Record<Tone, string> = { good: "var(--sl-ok)", warning: "var(--sl-warn)", critical: "var(--sl-alert)", neutral: "var(--sl-ink-muted)" };

function ToneDot({ tone }: { tone: Tone }) {
  return <span aria-hidden className="dot" style={{ ["--glyph" as string]: TONE_COLOR[tone], marginTop: 4 }} />;
}

const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

/** La semaine en un coup d'œil : disque plein = fait, rose = proposé, vide = rien. */
function WeekStrip({ dashboard }: { dashboard: Dashboard }) {
  return (
    <div className="week-strip" aria-label="Semaine en cours">
      {dashboard.week.map((day, index) => {
        const isToday = day.date === dashboard.today;
        const state = day.done.length ? "done" : day.planned ? "planned" : "";
        const title = day.done.length ? `${formatDate(day.date, "short")} : ${day.done.map((item) => (item.kind ? FAMILY_STYLE[familyOfKind(item.kind)].label : SPORT_LABELS[item.sport as Sport] ?? "activité")).join(", ")}` : day.planned ? "Séance proposée" : undefined;
        return (
          <div key={day.date} className={`week-day${isToday ? " today" : ""}`} title={title}>
            <span className="week-letter">{DAY_LETTERS[index]}</span>
            <span className={`week-dot ${state}`} />
          </div>
        );
      })}
    </div>
  );
}

function stickerText(label: string): string {
  const lower = label.toLowerCase();
  if (lower === "aujourd'hui") return "c'est aujourd'hui";
  if (lower === "demain") return "demain";
  return label.split(" ").slice(0, 2).join(" ").toLowerCase();
}

/* ---------- Prochaine séance : la carte jaune ---------- */
export function SuggestionCard({ dashboard, coach }: { dashboard: Dashboard; coach: CoachResult<OutlookCoachOutput> }) {
  const { suggestion, goal, today } = dashboard;
  const { primary, facts } = suggestion;
  const zone = SUGGESTION_ZONE[primary.type];
  const target = primary.target;
  const ready = coach.status === "ready" ? coach.output : null;
  const paceCenter = target?.paceFastMps && target.paceSlowMps ? (target.paceFastMps + target.paceSlowMps) / 2 : null;
  return (
    <section className="card card-hero card-next" aria-labelledby="next-title">
      {(() => {
        const sticker = primary.type === "rest" ? "repos" : stickerText(suggestion.when.label);
        // Mot long (« aujourd'hui ») : corps réduit pour rester dans le cercle.
        return <span className={`sticker${sticker.length > 10 ? " sticker-long" : ""}`} aria-hidden>{sticker}</span>;
      })()}
      <div className="card-eyebrow">Prochaine séance · {suggestion.when.label}</div>
      <h2 id="next-title" className="card-title">{primary.title}</h2>
      <div className="target">
        {primary.durationMin ? <span className="pill">{formatDuration(primary.durationMin * 60)}</span> : null}
        {target ? <span className="pill"><ZoneDot zone={zone} />{target.zone} · {target.heartRateLow}–{target.heartRateHigh} bpm</span> : null}
        {paceCenter ? <span className="pill" title={`${formatPace(target?.paceSlowMps)} à ${formatPace(target?.paceFastMps)}`}>≈ {formatPace(paceCenter)}</span> : null}
      </div>
      {primary.type !== "endurance" && primary.type !== "long" ? <p className="structure">{primary.structure}</p> : null}
      <div className="coach-lines">
        <p className="coach-line"><span className="coach-tag">Pourquoi</span><span>{ready ? ready.suggestionWhy : suggestion.reason}</span></p>
        <p className="coach-line"><span className="coach-tag">Comment</span><span>{ready ? ready.executionTip : primary.structure}</span></p>
      </div>
      {coach.status === "ready" ? <div style={{ marginTop: 6 }}><CoachStamp model={coach.model} createdAt={coach.createdAt} prefix="Avis" /><RateCoach subjectKind="outlook" subjectId={coach.createdAt} label="Ce conseil t'est utile ?" /></div> : null}
      {suggestion.alternative ? <p className="alt"><strong>Plan B · {suggestion.alternative.title}</strong> ({formatDuration(suggestion.alternative.durationMin * 60)}). {suggestion.alternative.reason}</p> : null}
      {suggestion.then ? (
        <div className="next-after">
          <span className="pill" style={{ padding: "2px 10px" }}><ZoneDot zone={SUGGESTION_ZONE[suggestion.then.type]} />Ensuite</span>
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

/* ---------- Ce qui manque pour des conseils précis (dit simplement, l'application reste utilisable) ---------- */
export function MissingInfo({ dashboard }: { dashboard: Dashboard }) {
  const missing: Array<{ text: string; href?: string; link?: string }> = [];
  if (!dashboard.profile.zonesFromWatch) missing.push({ text: "Zones cardiaques : celles de ta montre ne sont pas encore lues, on utilise des zones estimées à partir de ta FC max. Elles se mettent à jour à la prochaine synchronisation si ta montre les connaît." });
  if (dashboard.profile.lactateThresholdSpeedMps == null) missing.push({ text: "Seuil lactique : ta montre ne l'a pas encore estimé ; les allures cibles s'appuient alors sur tes séances récentes." });
  if (!dashboard.goal) missing.push({ text: "Objectif : pas encore renseigné, le coach vise ta progression générale.", href: "/objectif", link: "Le renseigner" });
  if (!missing.length) return null;
  return (
    <section className="section">
      <div className="card missing-info">
        <div className="card-eyebrow">Pour des conseils plus précis</div>
        <ul className="bullets">
          {missing.map((item) => <li key={item.text}>{item.text}{item.href ? <> <Link href={item.href}>{item.link}</Link></> : null}</li>)}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Téléphone : prochaine séance et progression d'un coup d'œil ---------- */
export function MobileGlance({ dashboard }: { dashboard: Dashboard }) {
  const { suggestion, progression } = dashboard;
  const { primary } = suggestion;
  const target = primary.target;
  const paceCenter = target?.paceFastMps && target.paceSlowMps ? (target.paceFastMps + target.paceSlowMps) / 2 : null;
  const gain = progression.paceGainSPerKm;
  return (
    <div className="glance" aria-label="En bref">
      <a className="glance-tile next" href="#next-title">
        <div className="card-eyebrow">Prochaine séance · {suggestion.when.label}</div>
        <div className="glance-title">{primary.title}</div>
        <p className="glance-line">
          {[primary.durationMin ? formatDuration(primary.durationMin * 60) : null, target ? `${target.zone} · ${target.heartRateLow}–${target.heartRateHigh} bpm` : null, paceCenter ? `≈ ${formatPace(paceCenter)}` : null].filter(Boolean).join(" · ")}
        </p>
        <p className="glance-line">{suggestion.reason}</p>
      </a>
      <a className="glance-tile" href="#progress-title">
        <div className="card-eyebrow"><Gauge size={13} /> Progression aérobie · {STATE_BADGE[progression.state]}</div>
        {progression.state !== "insufficient" ? (
          <>
            <div className="glance-big" style={{ marginTop: 6 }}>{formatPace(progression.recent.speedAtReferenceHr).replace("/km", "")}<span className="unit">/km à {progression.referenceHeartRateBpm} bpm</span></div>
            {gain != null ? <p className="glance-line">{Math.abs(gain) < 1 ? "Même allure" : `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"}`} que les {progression.windowWeeks} semaines précédentes</p> : null}
          </>
        ) : <p className="glance-line">Pas encore de tendance : il faut quelques sorties faciles de plus.</p>}
      </a>
    </div>
  );
}

/* ---------- Progression ---------- */
const STATE_BADGE: Record<string, string> = { progressing: "en progrès ↗", stable: "stable ≈", regressing: "en recul ↘", insufficient: "à suivre ?" };

export function ProgressionCard({ dashboard, coach }: { dashboard: Dashboard; coach: CoachResult<OutlookCoachOutput> }) {
  const { progression } = dashboard;
  const gain = progression.paceGainSPerKm;
  const toPace = (speed: number | null) => (speed ? 1000 / speed : null);
  const noise = progression.state === "stable" && progression.runToRunSpreadSPerKm != null
    ? `Écart dans la variation normale : tes sorties faciles varient de ±${progression.runToRunSpreadSPerKm} s/km d'une fois à l'autre.`
    : null;
  return (
    <section className="card card-hero" aria-labelledby="progress-title">
      <span className="state-badge">{STATE_BADGE[progression.state]}</span>
      <div className="card-eyebrow"><Gauge size={13} /> Progression aérobie</div>
      <h2 id="progress-title" style={{ position: "absolute", left: -9999 }}>Progression : {STATE_BADGE[progression.state]}</h2>
      {progression.state !== "insufficient" ? (
        <div className="big-number" style={{ marginTop: 14 }}>{formatPace(progression.recent.speedAtReferenceHr).replace("/km", "")}<span className="unit">/km à {progression.referenceHeartRateBpm} bpm</span></div>
      ) : (
        <div className="card-title" style={{ fontSize: 30 }}>Pas encore de tendance</div>
      )}
      <p className="state-sub">
        {gain != null ? <><strong>{Math.abs(gain) < 1 ? "Même allure" : `${formatNumber(Math.abs(gain))} s/km plus ${gain > 0 ? "rapide" : "lent"}`}</strong> que les {progression.windowWeeks} semaines précédentes ({formatPace(progression.previous.speedAtReferenceHr)})</> : progression.caveats[0]}
        {progression.confidence ? <span className="muted"> · confiance {CONFIDENCE_LABELS[progression.confidence]}</span> : null}
      </p>
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
        <span><span className="legend-swatch" style={{ background: "var(--sl-highlight)" }} />{progression.windowWeeks} dernières semaines</span>
        <span><span className="legend-swatch" style={{ background: "var(--sl-past)", borderColor: "transparent" }} />avant</span>
        <span>1 point = 1 sortie facile</span>
      </div>
      <div className="facts" style={{ marginTop: 12 }}>
        <Fact label="VO2max (montre)" value={formatNumber(progression.vo2max.latest, 1)} sub={progression.vo2max.delta != null ? `${progression.vo2max.delta >= 0 ? "+" : "−"}${formatNumber(Math.abs(progression.vo2max.delta), 1)} en ${progression.windowWeeks} sem.` : undefined} />
        <Fact label="Volume course" value={formatNumber(progression.recent.runKmPerWeek, 1)} unit="km/sem" sub={`avant : ${formatNumber(progression.previous.runKmPerWeek, 1)}`} />
        <Fact label="Sorties faciles mesurées" value={String(progression.recent.runs)} sub={`contre ${progression.previous.runs} avant`} />
      </div>
      <GoalStatusList markers={dashboard.goalMarkers} goal={dashboard.goal} today={dashboard.today} compact />
    </section>
  );
}

/* ---------- Forme et récupération : la couleur d'ombre identifie la métrique ---------- */
function Kpi({ icon, question, value, unit, compare, meaning, tone, chart, shadow }: { icon: React.ReactNode; question: string; value: string; unit?: string; compare: string; meaning: string; tone: Tone; chart: React.ReactNode; shadow: string }) {
  return (
    <div className="card kpi" style={{ ["--shadow-color" as string]: shadow }}>
      <div className="kpi-question">{icon}{question}</div>
      <div className="kpi-value">{value}{unit && value !== "—" ? <span className="unit">{unit}</span> : null}</div>
      <div className="kpi-compare num">{compare}</div>
      {chart}
      <div className="kpi-meaning"><ToneDot tone={tone} />{meaning}</div>
    </div>
  );
}

export function RecoveryRow({ dashboard }: { dashboard: Dashboard }) {
  const { load, recovery } = dashboard;
  const loadInfo = loadMeaning(load, dashboard.loadAlert);
  const hrvInfo = hrvMeaning(recovery);
  const sleepInfo = sleepMeaning(recovery);
  const rhrInfo = restingHrMeaning(recovery);
  return (
    <div className="grid grid-4">
      <Kpi shadow="var(--sl-orange)" icon={<Waves size={14} />} question="Ma charge est-elle raisonnable ?" value={String(load.acute7d)} unit="charge Garmin, 7 j" compare={load.ratio != null ? `contre ${load.chronicWeekly28d}/sem. en moyenne (×${formatNumber(load.ratio, 1)})` : "—"} meaning={loadInfo.text} tone={loadInfo.tone} chart={<Sparkline points={load.weeks.map((week) => ({ date: week.weekStart, value: week.load }))} unit="de charge" />} />
      <Kpi shadow="var(--sl-green)" icon={<HeartPulse size={14} />} question="Ma VFC est-elle normale ?" value={recovery.hrv.latest != null ? String(Math.round(recovery.hrv.latest)) : "—"} unit="ms cette nuit" compare={hrvCompare(recovery)} meaning={hrvInfo.text} tone={hrvInfo.tone} chart={<Sparkline points={recovery.hrv.series} unit="ms" />} />
      <Kpi shadow="var(--sl-blue)" icon={<Moon size={14} />} question="Ai-je assez dormi ?" value={recovery.sleep.latest != null ? formatDuration(recovery.sleep.latest) : "—"} compare={sleepCompare(recovery)} meaning={sleepInfo.text} tone={sleepInfo.tone} chart={<Sparkline points={recovery.sleep.series} unit="" format="duration" />} />
      <Kpi shadow="var(--sl-pink)" icon={<HeartPulse size={14} />} question="Ma FC de repos ?" value={recovery.restingHr.latest != null ? String(Math.round(recovery.restingHr.latest)) : "—"} unit="bpm" compare={restingHrCompare(recovery)} meaning={rhrInfo.text} tone={rhrInfo.tone} chart={<Sparkline points={recovery.restingHr.series} unit="bpm" />} />
    </div>
  );
}

/* ---------- Dernière séance ---------- */
export function LastSessionCard({ dashboard, coach }: { dashboard: Dashboard; coach: CoachResult<SessionCoachOutput> | null }) {
  const last = dashboard.lastRun;
  if (!last) return <div className="card"><p className="muted">Aucune course analysée pour l&apos;instant.</p></div>;
  const { activity, metrics, verdict } = last;
  const tone = VERDICT_TONES[verdict.level];
  // Analyse à jour, sinon la précédente (signalée comme telle) plutôt qu'un vide.
  const shown = coach?.status === "ready" ? coach : coach?.status === "missing" ? coach.previous ?? null : null;
  const stale = coach?.status === "missing" && shown != null;
  const ready = shown ? shown.output : null;
  const headline = ready ? ready.verdict : verdict.headline;
  const zone = dominantZone(metrics.zoneShares);
  const href = `/activities/${encodeURIComponent(activity.id)}`;
  return (
    <section className="card" style={{ ["--shadow-color" as string]: zoneColor(zone) }} aria-labelledby="last-title">
      <div className="row-between" style={{ flexWrap: "wrap" }}>
        <div className="row">
          <SessionGlyph family={familyOfKind(metrics.kind)} zone={zone} />
          <div>
            <div className="card-eyebrow">Dernière séance · {formatDate(activity.localDate, "long")}</div>
            <h2 id="last-title" className="section-title" style={{ fontSize: 30, marginTop: 2 }}>{sessionTitle(metrics)}</h2>
          </div>
        </div>
        <Badge tone={tone.tone} icon={tone.icon} label={`${VERDICT_LABELS[verdict.level]}${last.deltas.count ? ` · ${last.deltas.count} comparable${last.deltas.count > 1 ? "s" : ""}` : ""}`} />
      </div>
      <p className="verdict-line">{headline}</p>
      <div className="facts">
        <Fact label="Distance" value={activity.distanceM ? formatNumber(activity.distanceM / 1000, 2) : "—"} unit="km" />
        <Fact label="Durée" value={formatDuration(activity.movingTimeS)} />
        <Fact label="Allure moy." value={formatPace(activity.averageSpeedMps).replace("/km", "")} unit="/km" />
        <Fact label="FC moy." value={activity.averageHeartRateBpm ? String(Math.round(activity.averageHeartRateBpm)) : "—"} unit="bpm" />
      </div>
      <SessionPoints ready={ready} prescription={last.prescription} fallbackKeep={verdict.wentWell} />
      <div className="row-between" style={{ alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        {shown && !stale ? <span className="muted small"><CoachStamp model={shown.model} createdAt={shown.createdAt} />{verdict.fewComparables ? " · comparaison fragile (moins de 3 séances comparables)" : ""}</span> : stale && shown ? <span className="row small" style={{ flexWrap: "wrap" }}><CoachStamp model={shown.model} createdAt={shown.createdAt} /><CoachRequest endpoint={`/api/activities/${encodeURIComponent(activity.id)}/coach`} label="Mettre à jour l'analyse" /></span> : <CoachRequest endpoint={`/api/activities/${encodeURIComponent(activity.id)}/coach`} label="Demander l'analyse du coach" initialError={coach?.status === "error" ? coach.message : null} />}
        <Link href={href} className="btn btn-primary">Voir la séance <ArrowRight size={14} /></Link>
      </div>
    </section>
  );
}

/* ---------- Volume, intensité et séances récentes ---------- */
function ZoneLegend() {
  return (
    <div className="legend" style={{ marginTop: 8 }}>
      {([1, 2, 3, 4, 5] as Zone[]).map((zone) => <span key={zone}><span className="legend-swatch" style={{ background: zoneColor(zone) }} />{ZONE_NAMES[zone]}</span>)}
    </div>
  );
}

export function VolumeCard({ dashboard }: { dashboard: Dashboard }) {
  const { weeks } = dashboard.load;
  const total = weeks.reduce((sum, week) => sum + week.runKm, 0);
  return (
    <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-blue)" }}>
      <div className="section-head">
        <h2 className="section-title" style={{ fontSize: 26 }}>Volume, 12 semaines</h2>
        <span className="section-note num">{formatNumber(total / weeks.length, 1)} km/sem en moyenne · couleur = zone dominante</span>
      </div>
      <WeeklyVolumeChart weeks={weeks} />
      <ZoneLegend />
    </section>
  );
}

export function IntensityCard({ dashboard }: { dashboard: Dashboard }) {
  const intensity = dashboard.load.intensity28d;
  const weeks = dashboard.load.weeks.slice(-8);
  const totals = weeks.reduce((sum, week) => sum.map((value, index) => value + week.zoneMinutes[index]), [0, 0, 0, 0, 0]);
  const totalMinutes = totals.reduce((sum, value) => sum + value, 0);
  return (
    <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-pink)" }}>
      <div className="section-head">
        <h2 className="section-title" style={{ fontSize: 26 }}>Comment je répartis mon intensité ?</h2>
        <span className="section-note">temps par zone FC, toutes activités</span>
      </div>
      {intensity && totalMinutes > 0 ? (
        <>
          <div className="split-bar" aria-label="Répartition sur 8 semaines">
            {totals.map((minutes, index) => (minutes > 0 ? <span key={index} title={`${ZONE_NAMES[(index + 1) as Zone]} : ${minutes} min`} style={{ width: `${(minutes / totalMinutes) * 100}%`, background: zoneColor((index + 1) as Zone) }} /> : null))}
          </div>
          <p className="small" style={{ marginTop: 8 }}>
            Sur 4 semaines : <strong className="num">{Math.round(intensity.low * 100)} %</strong> facile (Z1–Z2), <strong className="num">{Math.round(intensity.moderate * 100)} %</strong> modéré, <strong className="num">{Math.round(intensity.high * 100)} %</strong> intense. <span className="muted">Repère courant en endurance : environ 80 % facile.</span>
          </p>
          <IntensityChart weeks={weeks.map((week) => ({ label: formatDate(week.weekStart, "short"), zones: week.zoneMinutes }))} />
          <ZoneLegend />
        </>
      ) : <p className="muted">Pas de données de FC sur les dernières semaines.</p>}
    </section>
  );
}

export function RecentList({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-blue)" }}>
      <div className="section-head">
        <h2 className="section-title" style={{ fontSize: 26 }}>Séances récentes</h2>
        <span className="section-note">couleur = zone dominante</span>
      </div>
      <div className="list">
        {dashboard.recent.map((activity) => {
          const family = familyOfKind(activity.kind);
          const zone = activity.kind ? dominantZone(activity.zoneShares) : null;
          return (
            <Link key={activity.id} href={`/activities/${encodeURIComponent(activity.id)}`} className="list-row">
              <span className="zone-bar" style={{ ["--glyph" as string]: zoneColor(zone) }} aria-hidden />
              <span style={{ minWidth: 0 }}>
                <span className="list-title">{activity.title ?? SPORT_LABELS[activity.sport as Sport] ?? activity.sport}</span>
                <span className="list-sub">{formatDate(activity.localDate, "short")} · {formatDuration(activity.movingTimeS)}{family === "other" ? ` · ${SPORT_LABELS[activity.sport as Sport] ?? ""}` : activity.averageSpeedMps ? ` · ${formatPace(activity.averageSpeedMps)}` : ""}</span>
              </span>
              <span className="list-metric">
                {activity.distanceM ? formatNumber(activity.distanceM / 1000, 1) : "—"}
                <small>{activity.distanceM ? "km" : activity.averageHeartRateBpm ? `${Math.round(activity.averageHeartRateBpm)} bpm` : ""}</small>
              </span>
            </Link>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>{dashboard.activityCount} activités synchronisées depuis Garmin.</p>
    </section>
  );
}
