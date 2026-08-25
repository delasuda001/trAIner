import { ActivityList } from "@/components/activity-list";
import Link from "next/link";

export default function HomePage() {
  return <main className="shell">
    <header className="topbar"><Link className="brand" href="/">RUN <span>INSIGHTS</span></Link><span className="eyebrow">TABLEAU DE BORD / ACTIVITÉS</span></header>
    <section className="hero"><p className="kicker">Votre journal de course</p><h1>Les kilomètres<br /><em>tels qu&apos;ils sont.</em></h1><p className="intro">Une vue claire de vos dernières séances, synchronisées depuis Intervals.icu.</p></section>
    <ActivityList />
  </main>;
}