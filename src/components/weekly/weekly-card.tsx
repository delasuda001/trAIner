import { ArrowRight, Check, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { CoachStamp } from "@/components/ui/coach-stamp";
import { formatDate } from "@/lib/formatters";
import type { StoredWeeklyReview } from "@/lib/server/coach-service";
import { addDays } from "@/lib/dates";

/** Carte courte du bilan hebdomadaire : juste, pas juste, ce que le coach change. Le détail est sur /bilan. */
export function WeeklyReviewCard({ review }: { review: StoredWeeklyReview }) {
  const { card } = review.output;
  return (
    <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-blue)" }} aria-labelledby="weekly-title">
      <div className="row-between" style={{ flexWrap: "wrap" }}>
        <div>
          <div className="card-eyebrow">Bilan du coach · semaine du {formatDate(review.weekStart, "short")} au {formatDate(addDays(review.weekStart, 6), "short")}</div>
          <h2 id="weekly-title" className="section-title">Le coach relit sa semaine</h2>
        </div>
        <CoachStamp model={review.model} createdAt={review.createdAt} prefix="Relu par" />
      </div>
      <ul className="weekly-lines">
        <li><Check size={14} /> <span><strong>Juste :</strong> {card.right}</span></li>
        <li><X size={14} /> <span><strong>Pas juste :</strong> {card.wrong}</span></li>
        <li><RefreshCw size={14} /> <span><strong>Ce que le coach change :</strong> {card.change}</span></li>
      </ul>
      <div style={{ marginTop: 10 }}><Link href="/bilan" className="btn">Détail des notes <ArrowRight size={14} /></Link></div>
    </section>
  );
}
