import { asAdmin } from "@/lib/profiles/request";
import type { Member } from "@/lib/profiles/types";
import { CoachRequest } from "@/components/coach-request";
import { WeeklyReviewCard } from "@/components/weekly/weekly-card";
import { addDays, localDate } from "@/lib/dates";
import { formatDate } from "@/lib/formatters";
import { listWeeklyReviews, type StoredWeeklyReview } from "@/lib/server/coach-service";
import { defaultReviewWeek } from "@/lib/server/weekly-dossier";

export const dynamic = "force-dynamic";

function Detail({ review }: { review: StoredWeeklyReview }) {
  const { output } = review;
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2 className="section-title">Notes de la semaine du {formatDate(review.weekStart, "medium")}</h2>
      {output.items.length ? (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead><tr><th>Quoi</th><th>Type</th><th>Pertinence</th><th>Actionnable</th><th>Jugement</th></tr></thead>
            <tbody>
              {output.items.map((item) => (
                <tr key={`${item.ref}-${item.kind}`}><td>{item.ref}</td><td className="muted">{item.kind}</td><td className="score">{item.relevance}/5</td><td className="score">{item.actionability}/5</td><td>{item.verdict}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">Rien à noter cette semaine.</p>}
      {output.contradictions.length ? <><h3 className="section-title" style={{ fontSize: 18, marginTop: 16 }}>Contradictions</h3><ul className="bullets">{output.contradictions.map((line) => <li key={line}>{line}</li>)}</ul></> : null}
      {output.weaknesses.length ? <><h3 className="section-title" style={{ fontSize: 18, marginTop: 16 }}>Faiblesses</h3><ul className="bullets">{output.weaknesses.map((line) => <li key={line}>{line}</li>)}</ul></> : null}
      {output.candidateRules.length ? (
        <>
          <h3 className="section-title" style={{ fontSize: 18, marginTop: 16 }}>Règles proposées (à tester par le banc, jamais appliquées d&apos;office)</h3>
          <ul className="bullets">{output.candidateRules.map((rule) => <li key={rule.rule}><strong>{rule.where} :</strong> {rule.rule} <span className="muted">({rule.evidence})</span></li>)}</ul>
        </>
      ) : null}
      {output.missingData.length ? <p className="muted small" style={{ marginTop: 12 }}>Données manquantes : {output.missingData.join(" ; ")}.</p> : null}
    </section>
  );
}

export default async function WeeklyReviewPage() {
  return asAdmin((member) => renderWeeklyReviewPage(member));
}

function renderWeeklyReviewPage(member: Member) {
  void member;
  const reviews = listWeeklyReviews(12);
  const week = defaultReviewWeek(localDate());
  const hasCurrent = reviews.some((review) => review.weekStart === week);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Bilan hebdomadaire</p>
          <h1 className="page-title">Le coach relit ses conseils</h1>
          <p className="page-sub">Chaque semaine, un modèle plus robuste confronte les analyses et consignes à ce que tu as couru et ressenti. Il propose des règles ; aucune n&apos;est appliquée sans validation.</p>
        </div>
        {hasCurrent ? null : <CoachRequest endpoint="/api/weekly-review" label={`Bilan de la semaine du ${formatDate(week, "short")} au ${formatDate(addDays(week, 6), "short")}`} />}
      </div>
      {reviews.length ? reviews.map((review) => (
        <div key={review.weekStart} className="section">
          <WeeklyReviewCard review={review} />
          <Detail review={review} />
        </div>
      )) : <div className="card"><p className="muted">Pas encore de bilan. Il est produit chaque dimanche soir par la tâche de nuit, ou à la demande ci-dessus.</p></div>}
    </>
  );
}
