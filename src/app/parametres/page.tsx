import Link from "next/link";
import { asMember, guestsSuspended } from "@/lib/profiles/request";
import type { Member } from "@/lib/profiles/types";
import { AccessPanel } from "@/components/settings/access-panel";
import { LogoutButton } from "@/components/profiles/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { MyDevices } from "@/components/settings/my-devices";
import { CoachGaugeLine } from "@/components/coach/coach-gauge";
import { ProfilesAdmin, type ProfileView } from "@/components/settings/profiles-admin";
import { getRegistry, toMember } from "@/lib/profiles/context";
import { PREPARATION_ESTIMATE, preparationAllowed, readPrepareStatus } from "@/lib/server/prepare-service";
import { guestsWeeklyCap, quotaStateOf, usageOf } from "@/lib/server/quota";
import { publicUrl } from "@/lib/server/profiles-admin";
import { reloadEnv } from "@/lib/server/sync-service";
import { checkGarminKey } from "@/lib/source/garmin";
import { Fact } from "@/components/ui/fact";
import { ModelPicker } from "@/components/settings/model-picker";
import { currentCoachModel } from "@/lib/coach";
import { generatedAtLabel, modelLabel } from "@/lib/coach/model-label";
import { summarizeUsage, totalTokens, type UsageTotals } from "@/lib/coach/usage-summary";
import { createUsageRepository } from "@/lib/db/repositories/usage-repository";
import { formatDate, formatNumber } from "@/lib/formatters";
import { readLastRateLimit, readRateLimits } from "@/lib/server/usage";
import { budgetFromEnv, budgetTokens } from "@/lib/bench/budget";
import { benchIsRunning, pendingTasks } from "@/lib/bench/runner";
import { BenchButton } from "@/components/settings/bench-button";
import { readReportIndex, readReportMarkdown } from "@/lib/bench/store";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = { session: "Analyse de séance", outlook: "Conseil du jour", chat: "Question au coach", weekly: "Bilan hebdomadaire", bench: "Banc de tests", feedback: "Synthèse des retours", prepare: "Préparation d'un invité" };
/** Travail automatique (bilan, banc), compté à part de l'usage de Bastien. */
const AUTOMATIC_KINDS = new Set(["weekly", "bench"]);
const OUTCOME_LABELS: Record<string, string> = { ok: "ok", rejected: "refusée", error: "échec" };
const WINDOW_LABELS: Record<string, string> = { five_hour: "fenêtre de 5 h", seven_day: "semaine", seven_day_opus: "semaine (Opus)", seven_day_sonnet: "semaine (Sonnet)" };

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

export default async function SettingsPage() {
  return asMember(async (member) => (member.role === "admin" ? renderAdmin(member) : renderGuest(member)));
}

/** Sur téléphone, le thème et la déconnexion quittent l'en-tête et vivent ici. */
function AccountRow({ name }: { name: string }) {
  return (
    <section className="card mobile-only" style={{ marginBottom: 16 }}>
      <div className="row-between">
        <span>Connecté : <strong>{name}</strong></span>
        <span className="row" style={{ gap: 8 }}><ThemeToggle /><LogoutButton name={name} label="Se déconnecter" /></span>
      </div>
    </section>
  );
}

const LOGIN_OUTCOMES: Record<string, string> = { ok: "entrée", refused: "refusée", locked: "bloquée (trop d'essais)" };

/** Profils, accès et journal : Bastien voit la consommation de chacun, jamais ses séances ni ses échanges. */
async function adminSections() {
  reloadEnv();
  const registry = getRegistry();
  const records = registry.list();
  const profiles: ProfileView[] = await Promise.all(records.map(async (record) => {
    const quota = quotaStateOf(record);
    const garmin = await checkGarminKey(record.garminEnvVar, false);
    return {
      id: record.id,
      name: record.name,
      role: record.role,
      garminEnvVar: record.garminEnvVar,
      garminPresent: garmin.present,
      usedToday: quota.usedToday,
      usedWeek: quota.usedWeek,
      dailyCap: record.role === "guest" ? record.dailyTokenCap : null,
      weeklyCap: record.role === "guest" ? record.weeklyTokenCap : null,
      devices: registry.listSessions(record.id).map((session) => ({ id: session.id, device: session.device, lastSeenAt: session.lastSeenAt })),
      lastLoginAt: record.lastLoginAt,
      disabled: record.disabledAt != null,
      invitationUntil: registry.pendingInvitation(record.id)?.expiresAt ?? null,
      onboarded: record.onboardedAt != null,
      hasCode: record.hasCode,
      prepare: record.role === "guest" ? readPrepareStatus(record.id) : null,
      prepareGuard: record.role === "guest" ? preparationAllowed(toMember(record)) : null,
    };
  }));
  const names = new Map(records.map((record) => [record.id, record.name]));
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const guestsWeekUsed = records.filter((record) => record.role === "guest").flatMap((record) => usageOf(record, weekAgo)).reduce((sum, record) => sum + budgetTokens(record), 0);
  const url = publicUrl("");
  const logins = registry.listLogins(40);
  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Profils du test</h2>
          <span className="section-note">chacun a sa base, sa clé Garmin et son coach ; tu ne vois que leur consommation</span>
        </div>
        <ProfilesAdmin profiles={profiles} publicUrlConfigured={url.configured} prepareEstimate={PREPARATION_ESTIMATE} />
      </section>
      <section className="section grid grid-main-side" style={{ alignItems: "start" }}>
        <div className="card">
          <h2 className="section-title">Accès depuis l&apos;extérieur</h2>
          <AccessPanel suspended={guestsSuspended()} publicUrl={url.configured ? url.url : null} guestsWeeklyCap={guestsWeeklyCap()} guestsWeekUsed={guestsWeekUsed} />
        </div>
        <div className="card">
          <h2 className="section-title">Journal des connexions</h2>
          {logins.length ? (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="data">
                <thead><tr><th>Quand</th><th>Qui</th><th>Par</th><th>Résultat</th><th>Appareil</th><th>Adresse</th></tr></thead>
                <tbody>
                  {logins.map((login) => (
                    <tr key={`${login.at}-${login.address ?? ""}`}><td>{generatedAtLabel(login.at)}</td><td>{login.profileId ? names.get(login.profileId) ?? login.profileId : "—"}</td><td>{login.method === "invitation" ? "lien" : "code"}</td><td className={login.outcome === "ok" ? "" : "text-warning"}>{LOGIN_OUTCOMES[login.outcome] ?? login.outcome}</td><td>{login.device}</td><td className="muted">{login.address ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted small">Aucune connexion pour l&apos;instant.</p>}
        </div>
      </section>
    </>
  );
}

/** Vue d'un invité : sa consommation et ses appareils, rien sur les autres profils. */
function renderGuest(member: Member) {
  const registry = getRegistry();
  const devices = registry.listSessions(member.id).map((session) => ({ id: session.id, device: session.device, lastSeenAt: session.lastSeenAt }));
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Paramètres</p>
          <h1 className="page-title">Ton test</h1>
          <p className="page-sub">Tes chiffres sont toujours calculés ; le coach, lui, partage l&apos;abonnement de Bastien.</p>
        </div>
      </div>
      <AccountRow name={member.name} />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          <h2 className="section-title">Le coach</h2>
          <p className="small" style={{ marginTop: 6 }}>Chaque commentaire du coach (analyse de séance, conseil, réponse) passe par l&apos;abonnement Claude de Bastien. Une analyse déjà faite se relit autant que tu veux.</p>
          <CoachGaugeLine />
        </section>
        <section className="card">
          <h2 className="section-title">Tes appareils connectés</h2>
          <MyDevices devices={devices} />
          <p className="muted small" style={{ marginTop: 10 }}>Un appareil perdu ? Déconnecte-le ici, ou préviens Bastien. <Link href="/bienvenue">Revoir l&apos;accueil du test</Link></p>
        </section>
      </div>
    </>
  );
}

async function renderAdmin(member: Member) {
  const repository = createUsageRepository();
  const now = new Date();
  const records = repository.since(new Date(now.getTime() - 30 * 86_400_000).toISOString());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const personal = records.filter((record) => !AUTOMATIC_KINDS.has(record.kind));
  const automatic = records.filter((record) => AUTOMATIC_KINDS.has(record.kind));
  const summary = summarizeUsage(personal, now, startOfToday);
  const automaticSummary = summarizeUsage(automatic, now, startOfToday);
  const budget = budgetFromEnv(process.env);
  const weekBudgetUsed = automatic.filter((record) => record.createdAt >= new Date(now.getTime() - 7 * 86_400_000).toISOString()).reduce((sum, record) => sum + budgetTokens(record), 0);
  const windows = Object.values(readRateLimits());
  const reports = readReportIndex().slice(0, 8);
  const pending = pendingTasks();
  const first = repository.first();
  const rateLimit = readLastRateLimit();
  const admin = await adminSections();
  const model = currentCoachModel();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Paramètres</p>
          <h1 className="page-title">Coach et consommation</h1>
          <p className="page-sub">Profils du test familial, accès, et ce que Claude consomme sur ton abonnement.</p>
        </div>
      </div>
      <AccountRow name={member.name} />
      {admin}

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
          <h2 className="section-title">Ta consommation (analyses, conseils, questions)</h2>
          <span className="section-note">{first ? `suivi depuis le ${formatDate(first.createdAt, "long")}` : "suivi démarré : aucun appel enregistré pour l'instant"}</span>
        </div>
        <div className="grid grid-3">
          <TotalsCard title="Aujourd'hui" totals={summary.today} />
          <TotalsCard title="7 derniers jours" totals={summary.last7Days} />
          <TotalsCard title="30 derniers jours" totals={summary.last30Days} />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Bilan et banc de tests</h2>
          <span className="section-note">compté à part de ton usage · plafonds : {tokens(budget.nightTokens)} par lancement, {tokens(budget.weekTokens)} sur 7 jours</span>
        </div>
        <div className="grid grid-3">
          <TotalsCard title="7 derniers jours" totals={automaticSummary.last7Days} />
          <TotalsCard title="30 derniers jours" totals={automaticSummary.last30Days} />
          <div className="card" style={{ ["--shadow-color" as string]: "var(--sl-orange)" }}>
            <div className="card-eyebrow">Plafond de la semaine</div>
            <div className="kpi-value">{Math.round((weekBudgetUsed / budget.weekTokens) * 100)}<span className="unit">%</span></div>
            <div className="kpi-compare">{tokens(weekBudgetUsed)} sur {tokens(budget.weekTokens)} (entrée + sortie + écriture du cache)</div>
            <div className="kpi-meaning">Part de l&apos;automatique sur 30 jours : {summary.last30Days.totalTokens + automaticSummary.last30Days.totalTokens ? Math.round((automaticSummary.last30Days.totalTokens / (summary.last30Days.totalTokens + automaticSummary.last30Days.totalTokens)) * 100) : 0} % de tous les tokens de l&apos;application.</div>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="section-title" style={{ fontSize: 18 }}>Le coach relit sa semaine</h3>
          <p className="small" style={{ marginTop: 4 }}>Outil de réglage, retiré du tableau de bord : un bilan Opus confronte chaque semaine les analyses et consignes à ce qui a été couru, et propose des règles à tester.</p>
          <p className="small" style={{ marginTop: 8 }}><Link href="/bilan" className="btn">Ouvrir les bilans</Link> <a href="/api/weekly-review/export" className="btn" download>Exporter en Markdown</a></p>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="section-title" style={{ fontSize: 18 }}>Banc de tests</h3>
          <p className="small" style={{ marginTop: 4 }}>{pending.length ? `${pending.length} tâche(s) en attente (reprises à chaque lancement, dans la limite des plafonds).` : "Rien en attente : toutes les variantes ont été évaluées."} Le banc arrête aussi si la fenêtre de 5 h dépasse {Math.round(budget.maxUtilization.fiveHour * 100)} % ou la semaine {Math.round(budget.maxUtilization.sevenDay * 100)} %{windows.length ? ` (dernier relevé : ${windows.map((window) => `${WINDOW_LABELS[window.window ?? ""] ?? window.window} ${window.utilization != null ? `${Math.round(window.utilization * (window.utilization <= 1 ? 100 : 1))} %` : "—"}`).join(", ")})` : ""}. Il propose, rien n&apos;est appliqué sans validation.</p>
          <BenchButton pending={pending.length} running={benchIsRunning()} />
          <p className="muted small" style={{ marginTop: 6 }}>Lance-le quand ton quota est disponible. Pour un budget plus large : <span className="mono">npm run bench -- --budget=150000</span>.</p>
          {reports.length ? (
            <div className="list" style={{ marginTop: 8 }}>
              {reports.map((report) => (
                <details key={report.file} className="more">
                  <summary><strong>{report.variant}</strong> · {formatDate(report.date, "medium")} · {report.recommendation} <span className="muted small">— {report.why}</span></summary>
                  <pre className="more-body" style={{ whiteSpace: "pre-wrap", fontSize: 12.5 }}>{readReportMarkdown(report.file) ?? "Rapport introuvable."}</pre>
                </details>
              ))}
            </div>
          ) : <p className="muted small" style={{ marginTop: 6 }}>Pas encore de rapport.</p>}
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
