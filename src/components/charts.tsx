"use client";

import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

/* Graphiques : une seule échelle verticale par graphique, couleurs par rôle
   (variables CSS du thème), grille discrète, infobulle au survol. */

const AXIS_TICK = { fill: "var(--text-3)", fontSize: 11 };
const GRID = "var(--border)";

function paceLabel(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
}

function range(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += step) values.push(value);
  return values;
}

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{title}</div>
      {lines.map((line) => <div key={line} className="tt-value">{line}</div>)}
    </div>
  );
}

/** Mode « captures d'écran » (?theme=…) : pas d'animation. */
function stillMode(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.still === "1";
}

function Gradient({ id, color, opacity = 0.35 }: { id: string; color: string; opacity?: number }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={opacity} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

/* ---------- Mini-courbe (KPI), qui se dessine au chargement ---------- */
export function Sparkline({ points, unit, format }: { points: Array<{ date: string; value: number | null }>; unit: string; format?: "duration" }) {
  const id = useId().replace(/:/g, "");
  const present = points.filter((point) => point.value != null);
  if (present.length < 3) return <div className="spark" />;
  const show = (value: number) => (format === "duration" ? `${Math.floor(value / 3600)} h ${String(Math.round((value % 3600) / 60)).padStart(2, "0")}` : `${Math.round(value)} ${unit}`);
  return (
    <div className="spark">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <Gradient id={id} color="var(--accent)" opacity={0.28} />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <XAxis dataKey="date" hide />
          <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={({ active, payload }) => (active && payload?.[0]?.value != null ? <TooltipBox title={shortDate(String(payload[0].payload.date))} lines={[show(Number(payload[0].value))]} /> : null)} />
          <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill={`url(#${id})`} dot={false} connectNulls isAnimationActive={!stillMode()} animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SparkBars({ points, unit }: { points: Array<{ label: string; value: number }>; unit: string }) {
  return (
    <div className="spark">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={3}>
          <XAxis dataKey="label" hide />
          <YAxis hide />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={`Semaine du ${String(payload[0].payload.label)}`} lines={[`${Math.round(Number(payload[0].value))} ${unit}`]} /> : null)} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {points.map((point, index) => <Cell key={point.label} fill={index === points.length - 1 ? "var(--accent)" : "var(--series-muted)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Volume hebdomadaire ---------- */
export function WeeklyVolumeChart({ weeks }: { weeks: Array<{ weekStart: string; runKm: number; runCount: number; otherMinutes: number }> }) {
  const id = useId().replace(/:/g, "");
  const data = weeks.map((week) => ({ ...week, label: shortDate(week.weekStart) }));
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="24%">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-2)" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={50} tickFormatter={(value: number) => `${value} km`} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const week = payload[0].payload as (typeof data)[number];
            return <TooltipBox title={`Semaine du ${week.label}`} lines={[`${week.runKm.toString().replace(".", ",")} km · ${week.runCount} course${week.runCount > 1 ? "s" : ""}`, ...(week.otherMinutes ? [`+ ${week.otherMinutes} min d'autres sports`] : [])]} />;
          }} />
          <Bar dataKey="runKm" radius={[6, 6, 2, 2]} isAnimationActive={false}>
            {data.map((week, index) => <Cell key={week.weekStart} fill={index === data.length - 1 ? `url(#${id})` : "var(--series-muted)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Intensité par semaine (minutes empilées) ---------- */
export function IntensityChart({ weeks }: { weeks: Array<{ label: string; low: number; moderate: number; high: number }> }) {
  return (
    <div className="chart" style={{ height: 130, marginTop: 10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={58} tickFormatter={(value: number) => `${value} min`} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const week = payload[0].payload as (typeof weeks)[number];
            return <TooltipBox title={`Semaine du ${week.label}`} lines={[`Facile : ${week.low} min`, `Modéré : ${week.moderate} min`, `Intense : ${week.high} min`]} />;
          }} />
          <Bar dataKey="low" stackId="i" fill="var(--zone-2)" isAnimationActive={false} />
          <Bar dataKey="moderate" stackId="i" fill="var(--zone-3)" isAnimationActive={false} />
          <Bar dataKey="high" stackId="i" fill="var(--zone-5)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Progression : allure à FC de repère, une course = un point ---------- */
export function ProgressionChart({ points, recentStart, recentLevel, previousLevel, referenceHr }: { points: Array<{ date: string; secondsPerKm: number }>; recentStart: string; recentLevel: number | null; previousLevel: number | null; referenceHr: number }) {
  if (points.length < 2) return null;
  const data = points.map((point) => ({ x: Date.parse(`${point.date}T12:00:00`), y: point.secondsPerKm, date: point.date, recent: point.date >= recentStart }));
  const ys = data.map((point) => point.y);
  const min = Math.floor((Math.min(...ys) - 10) / 30) * 30;
  const max = Math.ceil((Math.max(...ys) + 10) / 30) * 30;
  return (
    <div className="chart" style={{ height: 150, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="2 4" />
          <XAxis type="number" dataKey="x" domain={["dataMin - 86400000", "dataMax + 86400000"]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(value: number) => shortDate(new Date(value).toISOString().slice(0, 10))} />
          <YAxis type="number" dataKey="y" reversed domain={[min, max]} ticks={range(min, max, 30)} interval={0} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(value: number) => paceLabel(value)} />
          <ZAxis range={[70, 70]} />
          {previousLevel ? <ReferenceLine y={previousLevel} stroke="var(--text-3)" strokeDasharray="4 4" /> : null}
          {recentLevel ? <ReferenceLine y={recentLevel} stroke="var(--accent)" strokeDasharray="4 4" /> : null}
          <Tooltip cursor={false} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={shortDate(String(payload[0].payload.date))} lines={[`${paceLabel(Number(payload[0].payload.y))}/km à ${referenceHr} bpm`]} /> : null)} />
          <Scatter data={data} isAnimationActive={false}>
            {data.map((point) => <Cell key={point.date + point.y} fill={point.recent ? "var(--accent)" : "var(--series-muted)"} stroke="var(--surface)" strokeWidth={2} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Séance : allure et FC (deux graphiques empilés, même axe du temps) ---------- */
type StreamPoint = { t: number; pace: number | null; hr: number | null; alt: number | null };

function labelZoneLines(zoneFloors: number[], domain: number[], minGap: number): Array<{ floor: number; name: string; labeled: boolean }> {
  const lines: Array<{ floor: number; name: string; labeled: boolean }> = [];
  let lastLabeled = -Infinity;
  zoneFloors.slice(1).forEach((floor, index) => {
    if (floor <= domain[0] || floor >= domain[1]) return;
    const labeled = floor - lastLabeled >= minGap;
    if (labeled) lastLabeled = floor;
    lines.push({ floor, name: `Z${index + 2}`, labeled });
  });
  return lines;
}

function minutesLabel(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export function SessionStreamCharts({ points, zoneFloors, reps }: { points: StreamPoint[]; zoneFloors: number[]; reps: Array<{ from: number; to: number }> }) {
  const paceId = useId().replace(/:/g, "");
  const hrId = useId().replace(/:/g, "");
  const paces = points.map((point) => point.pace).filter((value): value is number => value != null);
  const heartRates = points.map((point) => point.hr).filter((value): value is number => value != null);
  if (points.length < 10 || !paces.length) return <p className="muted">Pas de séries détaillées pour cette activité.</p>;
  const sorted = [...paces].sort((a, b) => a - b);
  // Bornes robustes : arrêts et pics GPS hors cadre, la lecture des répétitions reste nette.
  const fast = sorted[Math.floor(sorted.length * 0.03)] ?? 180;
  const slow = sorted[Math.floor(sorted.length * 0.92)] ?? 480;
  const paceStep = slow - fast > 150 ? 60 : 30;
  const paceDomain = [Math.floor((fast - 5) / paceStep) * paceStep, Math.ceil((slow + 5) / paceStep) * paceStep];
  const data = points.map((point) => ({ ...point, pace: point.pace != null ? Math.min(Math.max(point.pace, paceDomain[0]), paceDomain[1]) : null }));
  const hrDomain = heartRates.length ? [Math.floor((Math.min(...heartRates) - 5) / 20) * 20, Math.ceil((Math.max(...heartRates) + 5) / 20) * 20] : [60, 200];
  // Étiquettes de zone espacées d'au moins ~12 px pour rester lisibles.
  const minGap = ((hrDomain[1] - hrDomain[0]) / 120) * 12;
  const zoneLines = labelZoneLines(zoneFloors, hrDomain, minGap);
  const shading = reps.map((rep) => <ReferenceArea key={rep.from} x1={rep.from} x2={rep.to} fill="var(--accent)" fillOpacity={0.1} stroke="none" ifOverflow="hidden" />);
  const common = { margin: { top: 6, right: 30, bottom: 0, left: 0 }, syncId: "session" };
  const xAxis = <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={minutesLabel} />;
  const tooltip = <Tooltip cursor={{ stroke: "var(--text-3)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={minutesLabel(Number(payload[0].payload.t))} lines={[payload[0].payload.pace != null ? `${paceLabel(Number(payload[0].payload.pace))}/km` : "—", payload[0].payload.hr != null ? `${payload[0].payload.hr} bpm` : ""].filter(Boolean)} /> : null)} />;
  return (
    <div className="grid" style={{ gap: 6 }}>
      <div className="legend"><span><span className="legend-swatch" style={{ background: "var(--series-pace)" }} />Allure (/km)</span>{reps.length ? <span><span className="legend-swatch" style={{ background: "var(--accent-soft)", outline: "1px solid var(--accent)" }} />répétitions détectées</span> : null}</div>
      <div className="chart chart-sm">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} {...common}>
            <Gradient id={paceId} color="var(--series-pace)" opacity={0.3} />
            <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="2 4" />
            {xAxis}
            <YAxis reversed domain={paceDomain} ticks={range(paceDomain[0], paceDomain[1], paceStep)} interval={0} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={paceLabel} allowDataOverflow />
            {shading}
            {tooltip}
            <Area type="monotone" dataKey="pace" stroke="var(--series-pace)" strokeWidth={2} fill={`url(#${paceId})`} baseValue={paceDomain[1]} dot={false} connectNulls isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="legend" style={{ marginTop: 6 }}><span><span className="legend-swatch" style={{ background: "var(--series-hr)" }} />Fréquence cardiaque (bpm) · pointillés : entrée dans chaque zone</span></div>
      <div className="chart chart-sm">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} {...common}>
            <Gradient id={hrId} color="var(--series-hr)" opacity={0.22} />
            <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="2 4" />
            {xAxis}
            <YAxis domain={hrDomain} ticks={range(hrDomain[0], hrDomain[1], 20)} interval={0} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
            {shading}
            {zoneLines.map((line) => <ReferenceLine key={line.floor} y={line.floor} stroke="var(--border-strong)" strokeDasharray="3 3" label={line.labeled ? { value: line.name, position: "right", fill: "var(--text-3)", fontSize: 10 } : undefined} />)}
            {tooltip}
            <Area type="monotone" dataKey="hr" stroke="var(--series-hr)" strokeWidth={2} fill={`url(#${hrId})`} baseValue={hrDomain[0]} dot={false} connectNulls isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Comparaison : la séance face à ses comparables (barre plus longue = plus rapide) ---------- */
export function ComparisonChart({ rows, metricLabel }: { rows: Array<{ label: string; secondsPerKm: number; heartRate: number | null; current: boolean }>; metricLabel: string }) {
  if (rows.length < 2) return null;
  const slowest = Math.max(...rows.map((row) => row.secondsPerKm));
  const fastest = Math.min(...rows.map((row) => row.secondsPerKm));
  const base = slowest + Math.max(15, (slowest - fastest) * 0.6);
  const data = rows.map((row) => ({ ...row, bar: base - row.secondsPerKm, text: `${paceLabel(row.secondsPerKm)}${row.heartRate ? ` · ${Math.round(row.heartRate)} bpm` : ""}` }));
  return (
    <div className="chart" style={{ height: 34 * rows.length + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 112, bottom: 0, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="label" width={124} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={String(payload[0].payload.label)} lines={[`${metricLabel} ${paceLabel(Number(payload[0].payload.secondsPerKm))}/km`, payload[0].payload.heartRate ? `${Math.round(Number(payload[0].payload.heartRate))} bpm` : ""].filter(Boolean)} /> : null)} />
          <Bar dataKey="bar" radius={[0, 6, 6, 0]} isAnimationActive={false}>
            {data.map((row) => <Cell key={row.label} fill={row.current ? "var(--accent)" : "var(--series-muted)"} />)}
            <LabelList dataKey="text" position="right" fill="var(--text-2)" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
