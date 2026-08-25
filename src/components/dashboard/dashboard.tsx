"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { CalendarDisplayItem, DashboardPeriod, RunningDashboardSummary, WeeklyRunningVolume } from "@/lib/dashboard/types";
import { DashboardSummary } from "./dashboard-summary";
import { WeeklyRunningVolumeChart } from "./weekly-running-volume-chart";
import { CalendarViewToggle } from "./calendar-view-toggle";
import { WeekCalendar } from "./week-calendar";
import { MonthCalendar } from "./month-calendar";

type DashboardData = { period: DashboardPeriod; calendarItems: CalendarDisplayItem[]; runningSummary12Weeks: RunningDashboardSummary; weeklyRunningVolume12Weeks: WeeklyRunningVolume[] };
type View = "week" | "month";

function today(): string { return new Date().toISOString().slice(0, 10); }
function shiftMonth(date: string, amount: number): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCMonth(value.getUTCMonth() + amount); return value.toISOString().slice(0, 10); }
function shiftWeek(date: string, amount: number): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount * 7); return value.toISOString().slice(0, 10); }
async function fetchDashboard(date: string, view: View): Promise<DashboardData> { const response = await fetch(`/api/dashboard?date=${date}&view=${view}`); const payload: unknown = await response.json(); if (!response.ok) { const errorPayload = payload as { error?: { message?: string; requestId?: string } }; throw new Error(`${errorPayload.error?.message ?? "Le dashboard est indisponible"}${errorPayload.error?.requestId ? ` (référence : ${errorPayload.error.requestId})` : ""}`); } return payload as DashboardData; }

export function Dashboard() {
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState(today);
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState<string>();
  useEffect(() => { let active = true; void fetchDashboard(date, view).then((nextData) => { if (active) { setData(nextData); setError(undefined); } }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Le dashboard est indisponible"); }); return () => { active = false; }; }, [date, view, reloadToken]);
  const navigate = (amount: number) => setDate((current) => view === "week" ? shiftWeek(current, amount) : shiftMonth(current, amount));
  return <section className="dashboard"><div className="dashboard-toolbar"><div className="period-controls"><button className="icon-button" aria-label="Période précédente" title="Précédent" onClick={() => navigate(-1)}><ChevronLeft size={18} /></button><button className="today-button" onClick={() => setDate(today())}>Aujourd&apos;hui</button><button className="icon-button" aria-label="Période suivante" title="Suivant" onClick={() => navigate(1)}><ChevronRight size={18} /></button></div><CalendarViewToggle view={view} onChange={setView} /></div>{error ? <div className="panel state error"><strong>Le dashboard ne peut pas être chargé.</strong><p>{error}</p><button className="button" onClick={() => setReloadToken((token) => token + 1)}><RefreshCw size={16} /> Réessayer</button></div> : !data ? <div className="panel state"><span className="spinner" />Chargement du dashboard...</div> : <><DashboardSummary summary={data.runningSummary12Weeks} /><WeeklyRunningVolumeChart data={data.weeklyRunningVolume12Weeks} /><section className="calendar-panel"><div className="section-heading"><div><p className="kicker">{view === "week" ? "Semaine" : "Mois"} · Course et activités manuelles</p><h2>Calendrier</h2></div><span className="calendar-legend">Course uniquement pour le volume</span></div>{view === "week" ? <WeekCalendar period={data.period} items={data.calendarItems} /> : <MonthCalendar period={data.period} items={data.calendarItems} selectedDate={date} />}</section></>}</section>;
}