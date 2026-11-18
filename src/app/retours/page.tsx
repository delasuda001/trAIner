import Link from "next/link";
import { CopyMarkdown, DeleteFeedback, SynthesisButton } from "@/components/feedback/feedback-tools";
import { generatedAtLabel } from "@/lib/coach/model-label";
import { CATEGORY_LABELS } from "@/lib/feedback/digest";
import { asAdmin } from "@/lib/profiles/request";
import { feedbackOverview, readSynthesis } from "@/lib/server/feedback-service";
import { getRegistry } from "@/lib/profiles/context";

export const dynamic = "force-dynamic";

/** Retours des testeurs, consolidés par thème (Bastien seulement). */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ profil?: string }> }) {
  const profileFilter = (await searchParams).profil;
  return asAdmin(() => {
    const profiles = getRegistry().list();
    const all = feedbackOverview();
    const view = profileFilter ? feedbackOverview({ profileId: profileFilter }) : all;
    const synthesis = readSynthesis(all.markdown);
    const { digest, names } = view;
    return (
      <>
        <div className="page-head">
          <div>
            <p className="eyebrow">Test familial</p>
            <h1 className="page-title">Retours des testeurs</h1>
            <p className="page-sub">Regroupés par thème, sans appel à Claude. La synthèse par Claude se fait sur bouton (environ 6 k tokens).</p>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <CopyMarkdown markdown={view.markdown} />
          </div>
        </div>

        <div className="chips" style={{ marginBottom: 16 }}>
          <Link className={`chip${!profileFilter ? " selected" : ""}`} href="/retours">Tous ({all.digest.total})</Link>
          {profiles.map((profile) => {
            const count = profile.testOf != null ? feedbackOverview({ profileId: profile.id }).digest.total : all.digest.byProfile.find((entry) => entry.profileId === profile.id)?.count ?? 0;
            return <Link key={profile.id} className={`chip${profileFilter === profile.id ? " selected" : ""}`} href={`/retours?profil=${profile.id}`}>{profile.name}{profile.testOf != null ? " · test" : ""} ({count})</Link>;
          })}
        </div>

        <section className="card" style={{ marginBottom: 16 }}>
          <div className="section-head">
            <h2 className="section-title">Synthèse par Claude</h2>
            {synthesis.status === "ready" ? <span className="section-note">du {generatedAtLabel(synthesis.createdAt)}{synthesis.stale ? " · de nouveaux retours sont arrivés depuis" : ""}</span> : null}
          </div>
          {synthesis.status === "ready" ? (
            <>
              <p>{synthesis.output.summary}</p>
              <div className="list">
                {synthesis.output.themes.map((theme) => (
                  <div key={theme.title} className="list-row" style={{ display: "block" }}>
                    <strong>{theme.title}</strong> <span className="muted small">· {theme.who} · priorité {theme.priority}</span>
                    <p className="small" style={{ margin: "4px 0 0" }}>{theme.need} <span className="muted">Piste : {theme.proposal}</span></p>
                  </div>
                ))}
              </div>
              {synthesis.output.coachQuality ? <p className="small"><strong>Le coach :</strong> {synthesis.output.coachQuality}</p> : null}
              {synthesis.output.questions.length ? <ul className="bullets">{synthesis.output.questions.map((question) => <li key={question}>{question}</li>)}</ul> : null}
            </>
          ) : <p className="muted small">Pas encore de synthèse.</p>}
          {all.digest.total && (synthesis.status !== "ready" || synthesis.stale) ? <div style={{ marginTop: 10 }}><SynthesisButton label={synthesis.status === "ready" ? "Mettre à jour la synthèse" : "Faire la synthèse"} /></div> : null}
        </section>

        {digest.ratings.length ? (
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 className="section-title">Pouces sur le coach</h2>
            <div className="list" style={{ marginTop: 8 }}>
              {digest.ratings.map((stat) => (
                <div key={stat.subjectKind} className="row-between" style={{ padding: "6px 0" }}>
                  <span>{stat.label} <span className="muted small">· {stat.byPrompt.map((entry) => `${entry.promptVersion} ${entry.up}/${entry.down}`).join(", ")}</span></span>
                  <strong className="num">👍 {stat.up} · 👎 {stat.down}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {digest.themes.length ? digest.themes.map((theme) => (
          <section key={`${theme.category}-${theme.screen}`} className="card" style={{ marginBottom: 12 }}>
            <h2 className="section-title" style={{ fontSize: 18 }}>{CATEGORY_LABELS[theme.category]} · {theme.screen} <span className="muted small">({theme.entries.length})</span></h2>
            <ul className="feedback-list">
              {theme.entries.map((entry) => (
                <li key={entry.id}>
                  <span className="muted small">{names.get(entry.profileId) ?? entry.profileId}, {generatedAtLabel(entry.createdAt)}{entry.rating === 1 ? " · 👍" : entry.rating === -1 ? " · 👎" : ""}</span>
                  <span>{entry.note}</span>
                  <DeleteFeedback id={entry.id} />
                </li>
              ))}
            </ul>
          </section>
        )) : <p className="muted">Aucun retour écrit pour l&apos;instant. Les testeurs ont un bouton « Un retour ? » sur chaque page et un pouce sous chaque analyse.</p>}
      </>
    );
  });
}
