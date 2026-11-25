"use client";

import { useId, useState, type PointerEvent } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

/* Graphiques : une seule échelle verticale par graphique, couleurs par rôle
   (variables CSS du thème), grille discrète, infobulle au survol. */

const AXIS_TICK = { fill: "var(--sl-ink-muted)", fontSize: 10.5, fontFamily: "var(--font-data)" };
const GRID = "var(--sl-grid)";

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


/**
 * Infobulle au doigt (téléphone) : visible seulement tant que le doigt est posé, fermée au relâcher,
 * au défilement ou au toucher ailleurs ; placée au-dessus du graphique pour ne jamais masquer la courbe.
 * À la souris, comportement habituel (survol).
 */
function useTouchTip() {
  const [touch, setTouch] = useState(false);
  const [down, setDown] = useState(false);
  const release = (event: PointerEvent) => { if (event.pointerType === "touch") setDown(false); };
  return {
    frame: {
      "data-touch": touch ? "" : undefined,
      onPointerDown: (event: PointerEvent) => { if (event.pointerType === "touch") { setTouch(true); setDown(true); } },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
    },
    props: touch ? { active: down ? undefined : false, position: { y: 0 }, allowEscapeViewBox: { x: false, y: true } } : {},
  };
}

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{title}</div>
      {lines.map((line) => <div key={line} className="tt-value">{line}</div>)}
    </div>
  );
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

/* ---------- Mini-courbe (KPI) : trait encre, sans remplissage ---------- */
export function Sparkline({ points, unit, format }: { points: Array<{ date: string; value: number | null }>; unit: string; format?: "duration" }) {
  const tip = useTouchTip();
  const present = points.filter((point) => point.value != null);
  if (present.length < 3) return <div className="spark" />;
  const show = (value: number) => (format === "duration" ? `${Math.floor(value / 3600)} h ${String(Math.round((value % 3600) / 60)).padStart(2, "0")}` : `${Math.round(value)} ${unit}`);
  return (
    <div className="spark" {...tip.frame}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <XAxis dataKey="date" hide />
          <Tooltip {...tip.props} cursor={{ stroke: "var(--sl-grid)" }} content={({ active, payload }) => (active && payload?.[0]?.value != null ? <TooltipBox title={shortDate(String(payload[0].payload.date))} lines={[show(Number(payload[0].value))]} /> : null)} />
          <Area type="linear" dataKey="value" stroke="var(--sl-ink)" strokeWidth={2.5} fill="none" dot={false} connectNulls isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const ZONE_FILLS = ["var(--sl-z1)", "var(--sl-z2)", "var(--sl-z3)", "var(--sl-z4)", "var(--sl-z5)"];
const ZONE_NAMES = ["Z1 Récup", "Z2 Endurance", "Z3 Tempo", "Z4 Seuil", "Z5 VO2max"];

/* ---------- Volume hebdomadaire, empilé par zone dominante de chaque sortie ---------- */
export function WeeklyVolumeChart({ weeks }: { weeks: Array<{ weekStart: string; runKm: number; runCount: number; otherMinutes: number; kmByZone: number[] }> }) {
  const tip = useTouchTip();
  const data = weeks.map((week) => ({ ...week, label: shortDate(week.weekStart), z1: week.kmByZone[0], z2: week.kmByZone[1], z3: week.kmByZone[2], z4: week.kmByZone[3], z5: week.kmByZone[4], z0: week.kmByZone[5] }));
  return (
    <div className="chart" {...tip.frame}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="26%">
          <CartesianGrid vertical={false} stroke="var(--sl-grid)" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--sl-border)", strokeWidth: 1.5 }} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={46} tickFormatter={(value: number) => `${value} km`} />
          <Tooltip {...tip.props} cursor={{ fill: "var(--sl-surface-2)" }} content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const week = payload[0].payload as (typeof data)[number];
            const byZone = week.kmByZone.slice(0, 5).map((km, index) => (km > 0 ? `${ZONE_NAMES[index]} : ${String(km).replace(".", ",")} km` : null)).filter((line): line is string => line != null);
            return <TooltipBox title={`Semaine du ${week.label}`} lines={[`${String(week.runKm).replace(".", ",")} km · ${week.runCount} course${week.runCount > 1 ? "s" : ""}`, ...byZone, ...(week.otherMinutes ? [`+ ${week.otherMinutes} min d'autres sports`] : [])]} />;
          }} />
          <Bar dataKey="z0" stackId="km" fill="var(--sl-past)" stroke="var(--sl-border)" strokeWidth={1.5} isAnimationActive={false} />
          {["z1", "z2", "z3", "z4", "z5"].map((key, index) => <Bar key={key} dataKey={key} stackId="km" fill={ZONE_FILLS[index]} stroke="var(--sl-border)" strokeWidth={1.5} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Intensité par semaine : minutes par zone FC, Z1 en bas ---------- */
export function IntensityChart({ weeks }: { weeks: Array<{ label: string; zones: number[] }> }) {
  const tip = useTouchTip();
  const data = weeks.map((week) => ({ label: week.label, z1: week.zones[0], z2: week.zones[1], z3: week.zones[2], z4: week.zones[3], z5: week.zones[4] }));
  return (
    <div className="chart" {...tip.frame} style={{ height: 150, marginTop: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--sl-grid)" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--sl-border)", strokeWidth: 1.5 }} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => `${value} min`} />
          <Tooltip {...tip.props} cursor={{ fill: "var(--sl-surface-2)" }} content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const week = payload[0].payload as (typeof data)[number];
            return <TooltipBox title={`Semaine du ${week.label}`} lines={[week.z1, week.z2, week.z3, week.z4, week.z5].map((minutes, index) => `${ZONE_NAMES[index]} : ${minutes} min`)} />;
          }} />
          {["z1", "z2", "z3", "z4", "z5"].map((key, index) => <Bar key={key} dataKey={key} stackId="i" fill={ZONE_FILLS[index]} stroke="var(--sl-border)" strokeWidth={1.5} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Progression : allure à FC de repère, une course = un point ---------- */
export function ProgressionChart({ points, recentStart, recentLevel, previousLevel, referenceHr }: { points: Array<{ date: string; secondsPerKm: number }>; recentStart: string; recentLevel: number | null; previousLevel: number | null; referenceHr: number }) {
  const tip = useTouchTip();
  if (points.length < 2) return null;
  const data = points.map((point) => ({ x: Date.parse(`${point.date}T12:00:00`), y: point.secondsPerKm, date: point.date, recent: point.date >= recentStart }));
  const ys = data.map((point) => point.y);
  const min = Math.floor((Math.min(...ys) - 10) / 30) * 30;
  const max = Math.ceil((Math.max(...ys) + 10) / 30) * 30;
  return (
    <div className="chart" {...tip.frame} style={{ height: 150, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis type="number" dataKey="x" domain={["dataMin - 86400000", "dataMax + 86400000"]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(value: number) => shortDate(new Date(value).toISOString().slice(0, 10))} />
          <YAxis type="number" dataKey="y" reversed domain={[min, max]} ticks={range(min, max, 30)} interval={0} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(value: number) => paceLabel(value)} />
          <ZAxis range={[70, 70]} />
          {previousLevel ? <ReferenceLine y={previousLevel} stroke="var(--sl-ink-muted)" strokeDasharray="4 4" /> : null}
          {recentLevel ? <ReferenceLine y={recentLevel} stroke="var(--sl-highlight)" strokeWidth={2.5} /> : null}
          <Tooltip {...tip.props} cursor={false} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={shortDate(String(payload[0].payload.date))} lines={[`${paceLabel(Number(payload[0].payload.y))}/km à ${referenceHr} bpm`]} /> : null)} />
          <Scatter data={data} isAnimationActive={false}>
            {data.map((point) => <Cell key={point.date + point.y} fill={point.recent ? "var(--sl-highlight)" : "var(--sl-past)"} stroke={point.recent ? "var(--sl-border)" : "none"} strokeWidth={1.5} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Séance : allure et FC (deux graphiques empilés, même axe du temps) ---------- */
type StreamPoint = { t: number; d: number | null; pace: number | null; hr: number | null; alt: number | null };

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
  const tip = useTouchTip();
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
  const shading = reps.map((rep) => <ReferenceArea key={rep.from} x1={rep.from} x2={rep.to} fill="var(--sl-z5)" fillOpacity={0.12} stroke="none" ifOverflow="hidden" />);
  const common = { margin: { top: 6, right: 30, bottom: 0, left: 0 }, syncId: "session" };
  const xAxis = <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={minutesLabel} />;
  const tooltip = <Tooltip {...tip.props} cursor={{ stroke: "var(--text-3)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={`${minutesLabel(Number(payload[0].payload.t))}${payload[0].payload.d != null ? ` · ${(Number(payload[0].payload.d) / 1000).toFixed(2).replace(".", ",")} km` : ""}`} lines={[payload[0].payload.pace != null ? `${paceLabel(Number(payload[0].payload.pace))}/km` : "—", payload[0].payload.hr != null ? `${payload[0].payload.hr} bpm` : ""].filter(Boolean)} /> : null)} />;
  return (
    <div className="grid" style={{ gap: 6 }}>
      <div className="legend"><span><span className="legend-swatch" style={{ background: "var(--series-pace)" }} />Allure (/km)</span>{reps.length ? <span><span className="legend-swatch" style={{ background: "var(--accent-soft)", outline: "1px solid var(--accent)" }} />répétitions détectées</span> : null}</div>
      <div className="chart chart-sm" {...tip.frame}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} {...common}>
            <Gradient id={paceId} color="var(--series-pace)" opacity={0.3} />
            <CartesianGrid stroke={GRID} vertical={false} />
            {xAxis}
            <YAxis reversed domain={paceDomain} ticks={range(paceDomain[0], paceDomain[1], paceStep)} interval={0} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={paceLabel} allowDataOverflow />
            {shading}
            {tooltip}
            <Area type="monotone" dataKey="pace" stroke="var(--series-pace)" strokeWidth={2} fill={`url(#${paceId})`} baseValue={paceDomain[1]} dot={false} connectNulls isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="legend" style={{ marginTop: 6 }}><span><span className="legend-swatch" style={{ background: "var(--series-hr)" }} />Fréquence cardiaque (bpm) · pointillés : entrée dans chaque zone</span></div>
      <div className="chart chart-sm" {...tip.frame}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} {...common}>
            <Gradient id={hrId} color="var(--series-hr)" opacity={0.22} />
            <CartesianGrid stroke={GRID} vertical={false} />
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
  const tip = useTouchTip();
  if (rows.length < 2) return null;
  const slowest = Math.max(...rows.map((row) => row.secondsPerKm));
  const fastest = Math.min(...rows.map((row) => row.secondsPerKm));
  const base = slowest + Math.max(15, (slowest - fastest) * 0.6);
  const data = rows.map((row) => ({ ...row, bar: base - row.secondsPerKm, text: `${paceLabel(row.secondsPerKm)}${row.heartRate ? ` · ${Math.round(row.heartRate)} bpm` : ""}` }));
  return (
    <div className="chart" {...tip.frame} style={{ height: 34 * rows.length + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 112, bottom: 0, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="label" width={124} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip {...tip.props} cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={String(payload[0].payload.label)} lines={[`${metricLabel} ${paceLabel(Number(payload[0].payload.secondsPerKm))}/km`, payload[0].payload.heartRate ? `${Math.round(Number(payload[0].payload.heartRate))} bpm` : ""].filter(Boolean)} /> : null)} />
          <Bar dataKey="bar" isAnimationActive={false}>
            {data.map((row) => <Cell key={row.label} fill={row.current ? "var(--sl-highlight)" : "var(--sl-past)"} stroke={row.current ? "var(--sl-border)" : "none"} strokeWidth={1.5} />)}
            <LabelList dataKey="text" position="right" fill="var(--text-2)" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
