"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

/* Graphiques : une seule échelle verticale par graphique, couleurs par rôle (variables CSS),
   grille discrète, infobulle au survol. */

const AXIS_TICK = { fill: "var(--text-3)", fontSize: 11 };
const GRID = "var(--border)";

function paceLabel(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
}

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{title}</div>
      {lines.map((line) => <div key={line} className="tt-value">{line}</div>)}
    </div>
  );
}

/* ---------- Mini-courbe (KPI) ---------- */
export function Sparkline({ points, unit, format }: { points: Array<{ date: string; value: number | null }>; unit: string; format?: "duration" }) {
  const present = points.filter((point) => point.value != null);
  if (present.length < 3) return <div className="spark" />;
  const show = (value: number) => (format === "duration" ? `${Math.floor(value / 3600)} h ${String(Math.round((value % 3600) / 60)).padStart(2, "0")}` : `${Math.round(value)} ${unit}`);
  return (
    <div className="spark">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <XAxis dataKey="date" hide />
          <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={({ active, payload }) => (active && payload?.[0]?.value != null ? <TooltipBox title={shortDate(String(payload[0].payload.date))} lines={[show(Number(payload[0].value))]} /> : null)} />
          <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SparkBars({ points, unit }: { points: Array<{ label: string; value: number }>; unit: string }) {
  return (
    <div className="spark">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
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
  const data = weeks.map((week) => ({ ...week, label: shortDate(week.weekStart) }));
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={50} tickFormatter={(value: number) => `${value} km`} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const week = payload[0].payload as (typeof data)[number];
            return <TooltipBox title={`Semaine du ${week.label}`} lines={[`${week.runKm.toString().replace(".", ",")} km · ${week.runCount} course${week.runCount > 1 ? "s" : ""}`, ...(week.otherMinutes ? [`+ ${week.otherMinutes} min d'autres sports`] : [])]} />;
          }} />
          <Bar dataKey="runKm" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((week, index) => <Cell key={week.weekStart} fill={index === data.length - 1 ? "var(--accent)" : "var(--zone-2)"} />)}
          </Bar>
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
  const min = Math.floor((Math.min(...ys) - 10) / 10) * 10;
  const max = Math.ceil((Math.max(...ys) + 10) / 10) * 10;
  return (
    <div className="chart" style={{ height: 170 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis type="number" dataKey="x" domain={["dataMin - 86400000", "dataMax + 86400000"]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(value: number) => shortDate(new Date(value).toISOString().slice(0, 10))} />
          <YAxis type="number" dataKey="y" reversed domain={[min, max]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => paceLabel(value)} />
          <ZAxis range={[60, 60]} />
          {previousLevel ? <ReferenceLine y={previousLevel} stroke="var(--text-3)" strokeDasharray="4 4" ifOverflow="extendDomain" /> : null}
          {recentLevel ? <ReferenceLine y={recentLevel} stroke="var(--accent)" strokeDasharray="4 4" ifOverflow="extendDomain" /> : null}
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

function range(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += step) values.push(value);
  return values;
}

function minutesLabel(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export function SessionStreamCharts({ points, zoneFloors }: { points: StreamPoint[]; zoneFloors: number[] }) {
  const paces = points.map((point) => point.pace).filter((value): value is number => value != null);
  if (points.length < 10) return <p className="muted">Pas de séries détaillées pour cette activité.</p>;
  const sorted = [...paces].sort((a, b) => a - b);
  // Bornes robustes : on ignore les arrêts et sprints extrêmes pour garder la courbe lisible.
  const fast = sorted[Math.floor(sorted.length * 0.02)] ?? 180;
  const slow = sorted[Math.floor(sorted.length * 0.95)] ?? 480;
  const paceStep = slow - fast > 150 ? 60 : 30;
  const paceDomain = [Math.floor((fast - 10) / paceStep) * paceStep, Math.ceil((slow + 10) / paceStep) * paceStep];
  const paceTicks = range(paceDomain[0], paceDomain[1], paceStep);
  const heartRates = points.map((point) => point.hr).filter((value): value is number => value != null);
  const hrDomain = [Math.floor((Math.min(...heartRates) - 5) / 10) * 10, Math.ceil((Math.max(...heartRates) + 5) / 10) * 10];
  const hrTicks = range(hrDomain[0], hrDomain[1], hrDomain[1] - hrDomain[0] > 80 ? 20 : 10);
  const data = points.map((point) => ({ ...point, pace: point.pace != null ? Math.min(Math.max(point.pace, paceDomain[0]), paceDomain[1]) : null }));
  const common = { margin: { top: 6, right: 8, bottom: 0, left: -6 }, syncId: "session" };
  const xAxis = <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={minutesLabel} />;
  return (
    <div className="grid" style={{ gap: 8 }}>
      <div className="section-note">Allure (/km)</div>
      <div className="chart chart-sm">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} {...common}>
            <CartesianGrid stroke={GRID} vertical={false} />
            {xAxis}
            <YAxis reversed domain={paceDomain} ticks={paceTicks} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={paceLabel} allowDataOverflow />
            <Tooltip cursor={{ stroke: "var(--text-3)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={minutesLabel(Number(payload[0].payload.t))} lines={[payload[0].payload.pace != null ? `${paceLabel(Number(payload[0].payload.pace))}/km` : "—", payload[0].payload.hr != null ? `${payload[0].payload.hr} bpm` : ""].filter(Boolean)} /> : null)} />
            <Line type="monotone" dataKey="pace" stroke="var(--series-pace)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="section-note">Fréquence cardiaque (bpm) · pointillés : début des zones Z2 à Z5</div>
      <div className="chart chart-sm">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} {...common}>
            <CartesianGrid stroke={GRID} vertical={false} />
            {xAxis}
            <YAxis domain={hrDomain} ticks={hrTicks} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => String(Math.round(value))} />
            {zoneFloors.slice(1).map((floor) => <ReferenceLine key={floor} y={floor} stroke="var(--border-strong)" strokeDasharray="3 3" ifOverflow="hidden" />)}
            <Tooltip cursor={{ stroke: "var(--text-3)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={minutesLabel(Number(payload[0].payload.t))} lines={[payload[0].payload.hr != null ? `${payload[0].payload.hr} bpm` : "—", payload[0].payload.pace != null ? `${paceLabel(Number(payload[0].payload.pace))}/km` : ""].filter(Boolean)} /> : null)} />
            <Line type="monotone" dataKey="hr" stroke="var(--series-hr)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
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
          <YAxis type="category" dataKey="label" width={96} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={String(payload[0].payload.label)} lines={[`${metricLabel} ${paceLabel(Number(payload[0].payload.secondsPerKm))}/km`, payload[0].payload.heartRate ? `${Math.round(Number(payload[0].payload.heartRate))} bpm` : ""].filter(Boolean)} /> : null)} />
          <Bar dataKey="bar" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((row) => <Cell key={row.label} fill={row.current ? "var(--accent)" : "var(--series-muted)"} />)}
            <LabelList dataKey="text" position="right" fill="var(--text-2)" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
