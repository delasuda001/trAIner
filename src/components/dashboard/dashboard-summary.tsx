import type { RunningDashboardSummary } from "@/lib/dashboard/types";

export function DashboardSummary({ summary }: { summary: RunningDashboardSummary }) {
  const items = [["Kilomètres", `${summary.totalDistanceKm.toFixed(1).replace(".", ",")} km`], ["Sorties", String(summary.runCount)], ["Km / semaine", `${summary.averageKmPerWeek.toFixed(1).replace(".", ",")} km`], ["Sorties / semaine", summary.averageRunsPerWeek.toFixed(1).replace(".", ",")], ["Semaines ≥ 2 sorties", String(summary.weeksWithAtLeastTwoRuns)]];
  return <section className="dashboard-summary"><div className="section-heading"><div><p className="kicker">{summary.label} · 12 dernières semaines</p><h2>Votre volume</h2></div></div><div className="summary-cards">{items.map(([label, value]) => <div className="dashboard-stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div></section>;
}