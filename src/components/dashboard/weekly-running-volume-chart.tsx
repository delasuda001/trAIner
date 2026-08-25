"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeeklyRunningVolume } from "@/lib/dashboard/types";

export function WeeklyRunningVolumeChart({ data }: { data: WeeklyRunningVolume[] }) {
  return <section className="dashboard-chart"><p className="kicker">Course uniquement</p><h2>Volume de course hebdomadaire</h2><p className="chart-note">Kilomètres parcourus, semaine par semaine.</p><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="#d8d8ca" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#65736b", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#65736b", fontSize: 11 }} axisLine={false} tickLine={false} unit=" km" /><Tooltip formatter={(value: unknown) => [`${typeof value === "number" ? value : 0} km`, "Distance"]} labelFormatter={(label) => `Semaine du ${label}`} contentStyle={{ border: "1px solid #d8d8ca", borderRadius: 0, background: "#fffdf8" }} /><Bar dataKey="distanceKm" fill="#f0785f" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div></section>;
}