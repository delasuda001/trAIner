import { z } from "zod";
import { Fact } from "@/components/ui/fact";
import { ModelPicker } from "@/components/settings/model-picker";
import { currentCoachModel } from "@/lib/coach";
import { generatedAtLabel, modelLabel } from "@/lib/coach/model-label";
import { summarizeUsage, totalTokens, type UsageTotals } from "@/lib/coach/usage-summary";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { createUsageRepository } from "@/lib/db/repositories/usage-repository";
import { formatDate, formatNumber } from "@/lib/formatters";
import { RATE_LIMIT_KEY } from "@/lib/server/usage";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = { session: "Analyse de séance", outlook: "Conseil du jour", chat: "Question au coach" };
const OUTCOME_LABELS: Record<string, string> = { ok: "ok", rejected: "refusée", error: "échec" };
const WINDOW_LABELS: Record<string, string> = { five_hour: "fenêtre de 5 h", seven_day: "semaine", seven_day_opus: "semaine (Opus)", seven_day_sonnet: "semaine (Sonnet)" };

const rateLimitSchema = z.object({ status: z.string(), window: z.string().nullable(), utilization: z.number().nullable(), resetsAt: z.string().nullable(), seenAt: z.string() });

function tokens(value: number): string {
  return value >= 10_000 ? `${formatNumber(value / 1000, 0)} k` : formatNumber(value);
}

function TotalsCard({ title, totals }: { title: string; totals: UsageTotals }) {
  return (
    <div className="card" style={{ ["--shadow-color" as string]: "var(--sl-blue)" }}>
      <div className="card-eyebrow">{title}</div>
      <div className="kpi-value">{tokens(totals.totalTokens)}<span className="unit">tokens</span></div>
      <div className="kpi-compare">{totals.calls} appel{totals.calls > 1 ? "s" : ""} · entrée {tokens(totals.inputTokens)} · sortie {tokens(totals.outputTokens)} · cache lu {tokens(totals.cacheReadTokens)}</div>
      <div className="kpi-meaning">équivalent API indicatif : {formatNumber(totals.costUsd, 2)} $</div>
    </div>
  );
}

export default function SettingsPage() {
  const repository = createUsageRepository();
  const now = new Date();
  const records = repository.since(new Date(now.getTime() - 30 * 86_400_000).toISOString());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const summary = summarizeUsage(records, now, startOfToday);
  const first = repository.first();
  const rateLimit = createAppStateRepository().get(RATE_LIMIT_KEY, rateLimitSchema);
  const model = currentCoachModel();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Paramètres</p>
          <h1 className="page-title">Coach et consommation</h1>
          <p className="page-sub">Ce que Claude consomme sur ton abonnement pour les analyses, les conseils et tes questions.</p>
        </div>
      </div>

      <div className="grid grid-main-side" style={{ alignItems: "start" }}>
        <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-pink)" }}>
          <h2 className="section-title">Modèle du coach</h2>
          <p className="muted small" style={{ margin: "4px 0 12px" }}>Utilisé pour les analyses, le conseil du jour et « Demander au coach ». Actuellement : <strong>{modelLabel(model) === model ? model : modelLabel(model)}</strong>.</p>
          <ModelPicker current={model} />
        </section>
        <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-orange)" }}>
          <h2 className="section-title">Quota de l&apos;abonnement</h2>
          {rateLimit ? (
            <div className="facts" style={{ marginTop: 10 }}>
              <Fact label="État" value={rateLimit.status === "allowed" ? "OK" : rateLimit.status === "allowed_warning" ? "Proche de la limite" : "Limite atteinte"} />
              {rateLimit.utilization != null ? <Fact label={`Utilisé (${WINDOW_LABELS[rateLimit.window ?? ""] ?? rateLimit.window ?? "fenêtre"})`} value={`${Math.round(rateLimit.utilization * (rateLimit.utilization <= 1 ? 100 : 1))} %`} /> : null}
              {rateLimit.resetsAt ? <Fact label="Se réinitialise" value={generatedAtLabel(rateLimit.resetsAt)} /> : null}
            </div>
          ) : (
            <p className="small" style={{ marginTop: 8 }}>Claude n&apos;a pas encore communiqué d&apos;état de quota à l&apos;application. Le suivi complet de ton abonnement (toutes utilisations confondues) est dans Claude : <span className="mono">Paramètres → Utilisation</span> sur claude.ai ou dans l&apos;application, ou la commande <span className="mono">/usage</span> dans Claude Code.</p>
          )}
          {rateLimit ? <p className="muted small" style={{ marginTop: 8 }}>Relevé le {generatedAtLabel(rateLimit.seenAt)}. Le quota est partagé avec ton usage de Claude ailleurs ; le détail complet est dans Claude : Paramètres → Utilisation, ou <span className="mono">/usage</span> dans Claude Code.</p> : null}
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Consommation de l&apos;application</h2>
          <span className="section-note">{first ? `suivi depuis le ${formatDate(first.createdAt, "long")}` : "suivi démarré : aucun appel enregistré pour l'instant"}</span>
        </div>
        <div className="grid grid-3">
          <TotalsCard title="Aujourd'hui" totals={summary.today} />
          <TotalsCard title="7 derniers jours" totals={summary.last7Days} />
          <TotalsCard title="30 derniers jours" totals={summary.last30Days} />
        </div>
      </section>

      <div className="grid grid-main-side section" style={{ alignItems: "start" }}>
        <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-blue)" }}>
          <div className="section-head">
            <h2 className="section-title">Derniers appels</h2>
            <span className="section-note">chiffres renvoyés par Claude · « refusée » = réponse rejetée par le contrôle des chiffres, puis refaite</span>
          </div>
          {records.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Quand</th><th>Type</th><th>Modèle</th><th>Entrée</th><th>Sortie</th><th>Cache lu</th><th>Durée</th><th>État</th></tr></thead>
                <tbody>
                  {records.slice(0, 25).map((record) => (
                    <tr key={record.id}>
                      <td>{generatedAtLabel(record.createdAt)}</td>
                      <td>{KIND_LABELS[record.kind] ?? record.kind}</td>
                      <td>{modelLabel(record.model)}</td>
                      <td>{tokens(record.inputTokens)}</td>
                      <td>{tokens(record.outputTokens)}</td>
                      <td>{tokens(record.cacheReadTokens)}</td>
                      <td>{record.durationMs ? `${formatNumber(record.durationMs / 1000, 0)} s` : "—"}</td>
                      <td className="muted">{OUTCOME_LABELS[record.outcome] ?? record.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">Aucun appel depuis le démarrage du suivi. Les appels apparaîtront ici dès la prochaine analyse ou question.</p>}
        </section>
        <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-green)" }}>
          <h2 className="section-title">En moyenne</h2>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead><tr><th></th><th>Entrée</th><th>Sortie</th><th>Cache</th></tr></thead>
              <tbody>
                {([["Par analyse de séance", summary.averagePerAnalysis], ["Par question", summary.averagePerQuestion]] as const).map(([label, value]) => (
                  <tr key={label}><td className="muted">{label}{value ? ` (${value.calls})` : ""}</td><td>{value ? tokens(value.inputTokens) : "—"}</td><td>{value ? tokens(value.outputTokens) : "—"}</td><td>{value ? tokens(value.cacheTokens) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small" style={{ marginTop: 10 }}>Réponses refusées par le contrôle des chiffres : <strong className="num">{summary.rejectionRate != null ? `${Math.round(summary.rejectionRate * 100)} %` : "—"}</strong>{summary.rejectedCalls ? ` (${summary.rejectedCalls} sur 30 jours)` : ""}. <span className="muted">Une réponse refusée est redemandée une fois, en signalant à Claude le chiffre en cause ; tu ne vois que la réponse validée.</span></p>
          <h3 className="fact-label" style={{ marginTop: 18 }}>Répartition sur 30 jours</h3>
          <div className="list" style={{ marginTop: 6 }}>
            {summary.byKind.map((entry) => (
              <div key={entry.kind} className="row-between" style={{ padding: "7px 0", borderTop: "1.5px solid var(--sl-grid)" }}>
                <span>{KIND_LABELS[entry.kind] ?? entry.kind} <span className="muted small">· {entry.calls} appel{entry.calls > 1 ? "s" : ""}</span></span>
                <strong className="num">{tokens(entry.totalTokens)}</strong>
              </div>
            ))}
            {!summary.byKind.length ? <p className="muted small">—</p> : null}
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>Entrée : consignes et données envoyées ; sortie : la réponse ; cache : consignes déjà envoyées, relues à moindre coût. Le montant en dollars est l&apos;équivalent tarif API indiqué par Claude : avec l&apos;abonnement, rien n&apos;est facturé à l&apos;appel.</p>
        </section>
      </div>
      <p className="muted small" style={{ marginTop: 18 }}>{records.length ? `Total depuis ${first ? formatDate(first.createdAt, "medium") : "le début"} : ${tokens(records.reduce((sum, record) => sum + totalTokens(record), 0))} tokens.` : ""}</p>
    </>
  );
}
