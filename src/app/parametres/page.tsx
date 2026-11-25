import Link from "next/link";
import { z } from "zod";
import { asMember, guestsSuspended, VIEW_AS_LOG_KEY } from "@/lib/profiles/request";
import type { Member } from "@/lib/profiles/types";
import { AccessPanel } from "@/components/settings/access-panel";
import { LogoutButton } from "@/components/profiles/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { MyDevices } from "@/components/settings/my-devices";
import { CoachGaugeLine } from "@/components/coach/coach-gauge";
import { ProfilesAdmin, type ProfileView } from "@/components/settings/profiles-admin";
import { getRegistry, toMember } from "@/lib/profiles/context";
import { testCoachSimulated } from "@/lib/profiles/test-profile";
import { PREPARATION_ESTIMATE, preparationAllowed, readPrepareStatus } from "@/lib/server/prepare-service";
import { guestsWeeklyCap, quotaStateOf, usageOf } from "@/lib/server/quota";
import { publicUrl, trainingOptOut } from "@/lib/server/profiles-admin";
import { PrivacyNotice } from "@/components/profiles/privacy-notice";
import { reloadEnv } from "@/lib/server/sync-service";
import { checkGarminKey } from "@/lib/source/garmin";
import { Fact } from "@/components/ui/fact";
import { ModelPicker } from "@/components/settings/model-picker";
import { ViewPicker } from "@/components/settings/view-picker";
import { ReplayTourButton } from "@/components/tour/welcome-tour";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { resolveViewMode, VIEW_MODE_KEY, viewModeSchema } from "@/lib/view-mode";
import { currentCoachModel } from "@/lib/coach";
import { generatedAtLabel, modelLabel } from "@/lib/coach/model-label";
import { summarizeUsage, totalTokens, type UsageTotals } from "@/lib/coach/usage-summary";
import { createUsageRepository } from "@/lib/db/repositories/usage-repository";
import { formatDate, formatNumber } from "@/lib/formatters";
import { rateLimitsCheckedAt, readLastRateLimit, readRateLimits, refreshRateLimits } from "@/lib/server/usage";
import { budgetFromEnv, budgetTokens } from "@/lib/bench/budget";
import { benchIsRunning, pendingTasks } from "@/lib/bench/runner";
import { BenchButton } from "@/components/settings/bench-button";
import { QualityPanel } from "@/components/settings/quality-panel";
import { reviewIsRunning } from "@/lib/server/quality-review-service";
import { readReportIndex, readReportMarkdown } from "@/lib/bench/store";
import { SettingsGroup } from "@/components/settings/settings-group";
import { GroupMemory } from "@/components/settings/group-memory";
import { EnvSwitchCard } from "@/components/env/env-switch";
import { BarChart3, FlaskConical, Globe, Lock, ShieldCheck, SlidersHorizontal, Smartphone, Users } from "lucide-react";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = { session: "Analyse de séance", outlook: "Conseil du jour", chat: "Question au coach", weekly: "Bilan hebdomadaire", bench: "Banc de tests", feedback: "Synthèse des retours", prepare: "Préparation d'un invité", review: "Relecture des analyses" };
/** Travail automatique (bilan, banc), compté à part de l'usage de Bastien. */
const AUTOMATIC_KINDS = new Set(["weekly", "bench", "review"]);
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
      guestCode: record.guestCode,
      isTest: record.testOf != null,
      prepare: record.role === "guest" ? readPrepareStatus(record.id) : null,
      prepareGuard: record.role === "guest" ? preparationAllowed(toMember(record)) : null,
    };
  }));
  const names = new Map(records.map((record) => [record.id, record.name]));
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const guestsWeekUsed = records.filter((record) => record.role === "guest" && record.testOf == null).flatMap((record) => usageOf(record, weekAgo)).reduce((sum, record) => sum + budgetTokens(record), 0);
  const url = publicUrl("");
  const logins = registry.listLogins(40);
  const findings = registry.listQualityFindings({ limit: 200 }).map((finding) => ({ id: finding.id, profileName: names.get(finding.profileId) ?? finding.profileId, subjectKind: finding.subjectKind, subjectId: finding.subjectId, source: finding.source, code: finding.code, severity: finding.severity, where: finding.where, message: finding.message, createdAt: finding.createdAt }));
  const guests = records.filter((record) => record.role === "guest" && record.testOf == null).length;
  const suspended = guestsSuspended();
  return {
    profilesBadge: `${guests} invité${guests > 1 ? "s" : ""}`,
    accessBadge: suspended ? "invités coupés" : url.configured ? "ouvert" : "local seulement",
    qualityBadge: findings.length ? `${findings.length >= 200 ? "200+" : findings.length} constat${findings.length > 1 ? "s" : ""}` : "aucun constat",
    quality: <div className="card"><QualityPanel findings={findings} reviewRunning={reviewIsRunning()} /></div>,
    profiles: <ProfilesAdmin profiles={profiles} publicUrlConfigured={url.configured} prepareEstimate={PREPARATION_ESTIMATE} testCoachSimulated={testCoachSimulated()} />,
    access: (
      <div className="grid grid-main-side">
        <div className="card">
          <h2 className="section-title">Accès depuis l&apos;extérieur</h2>
          <AccessPanel suspended={suspended} publicUrl={url.configured ? url.url : null} guestsWeeklyCap={guestsWeeklyCap()} guestsWeekUsed={guestsWeekUsed} trainingOptOut={trainingOptOut()} />
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
      </div>
    ),
  };
}

/** Vue d'un invité : sa consommation et ses appareils, rien sur les autres profils. */
function renderGuest(member: Member) {
  const registry = getRegistry();
  const devices = registry.listSessions(member.id).map((session) => ({ id: session.id, device: session.device, lastSeenAt: session.lastSeenAt }));
  const record = registry.find(member.id);
  const address = publicUrl("").url;
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
      <GroupMemory scope="invite" />
      <div className="settings-groups">
        <SettingsGroup id="espace" title="Ton espace" note="le coach et l'affichage du tableau de bord" icon={SlidersHorizontal} accent="pink" open>
          <div className="grid grid-2">
            <section className="card">
              <h2 className="section-title">Le coach</h2>
              <p className="small" style={{ marginTop: 6 }}>Chaque commentaire du coach (analyse de séance, conseil, réponse) passe par l&apos;abonnement Claude de Bastien. Une analyse déjà faite se relit à volonté.</p>
              <CoachGaugeLine />
            </section>
            <section className="card">
              <h2 className="section-title">Tableau de bord</h2>
              <p className="small" style={{ margin: "6px 0 10px" }}>Vue essentielle (jauges et calendrier) ou complète (toutes les cartes).</p>
              <ViewPicker current={resolveViewMode(createAppStateRepository().get(VIEW_MODE_KEY, viewModeSchema), member.role)} />
              <p className="small" style={{ margin: "14px 0 8px" }}>Besoin d&apos;un rappel ? Accueil, coach et objectif en une minute.</p>
              <ReplayTourButton />
            </section>
          </div>
        </SettingsGroup>
        <SettingsGroup id="appareils" title="Tes appareils" note="où tu es connecté, et comment ouvrir Sillage ailleurs" badge={`${devices.length} appareil${devices.length > 1 ? "s" : ""}`} icon={Smartphone} accent="blue" open>
          <section className="card">
            <h2 className="section-title">Tes appareils connectés</h2>
            <MyDevices devices={devices} />
            <div className="other-device">
              <div className="fact-label">Ouvrir Sillage sur un autre appareil</div>
              <p className="small" style={{ margin: "4px 0 0" }}>Va sur {address ? <strong className="mono">{address.replace(/^https?:\/\//, "")}</strong> : "la même adresse"}, puis entre ton prénom <strong>{member.name}</strong> et ton code {record?.guestCode ? <strong className="mono">{record.guestCode}</strong> : "(demande-le à Bastien)"}. Une seule fois par appareil.</p>
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>Un appareil perdu ? Déconnecte-le ici, ou préviens Bastien. <Link href="/bienvenue">Revoir l&apos;accueil du test</Link></p>
          </section>
        </SettingsGroup>
        <SettingsGroup id="donnees" title="Confidentialité" note="où sont gardées tes données et ce que voit Bastien" icon={Lock} accent="green">
          <PrivacyNotice trainingOptOut={trainingOptOut()} viewLog={registry.getSetting(VIEW_AS_LOG_KEY(member.id), z.array(z.string())) ?? []} />
        </SettingsGroup>
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
  await refreshRateLimits({ waitMs: 2_500 });
  const windows = Object.values(readRateLimits());
  const checkedAt = rateLimitsCheckedAt();
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
      <EnvSwitchCard />
      <GroupMemory scope="admin" />
      <div className="settings-groups">
        <SettingsGroup id="profils" title="Profils du test" note="chacun a sa base, sa clé Garmin et son coach ; tu ne vois que leur consommation" badge={admin.profilesBadge} icon={Users} accent="blue" open closedOnPhone>
          {admin.profiles}
        </SettingsGroup>
        <SettingsGroup id="coach" title="Coach et affichage" note="modèle du coach, vue du tableau de bord, quota de l'abonnement" badge={modelLabel(model)} icon={SlidersHorizontal} accent="pink" open>
          <div className="grid grid-3">
            <section className="card">
              <h2 className="section-title">Tableau de bord</h2>
              <p className="small" style={{ margin: "6px 0 10px" }}>Ta vue : essentielle (jauges et calendrier) ou complète. Celle des invités se règle de leur côté (essentielle par défaut).</p>
              <ViewPicker current={resolveViewMode(createAppStateRepository().get(VIEW_MODE_KEY, viewModeSchema), member.role)} />
              <p className="small" style={{ margin: "14px 0 8px" }}>La visite guidée (accueil, coach, objectif) que voit chaque profil à sa première connexion.</p>
              <ReplayTourButton />
            </section>
            <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-pink)" }}>
              <h2 className="section-title">Modèle du coach</h2>
              <p className="muted small" style={{ margin: "4px 0 12px" }}>Utilisé pour les analyses, le conseil du jour et « Demander au coach ». Actuellement : <strong>{modelLabel(model) === model ? model : modelLabel(model)}</strong>.</p>
              <ModelPicker current={model} />
            </section>
            <section className="card" style={{ ["--shadow-color" as string]: "var(--sl-orange)" }}>
              <h2 className="section-title">Quota de l&apos;abonnement</h2>
              {windows.length ? (
                <div className="facts" style={{ marginTop: 10 }}>
                  {windows.filter((window) => !window.resetsAt || new Date(window.resetsAt) > now).map((window) => (
                    <Fact key={window.window ?? "inconnue"} label={`${WINDOW_LABELS[window.window ?? ""] ?? window.window ?? "fenêtre"}`} value={`${window.utilization != null ? `${Math.round(window.utilization * (window.utilization <= 1 ? 100 : 1))} %` : window.status === "rejected" ? "limite atteinte" : window.status === "allowed_warning" ? "proche de la limite" : "—"}${window.resetsAt ? ` · remise à zéro ${generatedAtLabel(window.resetsAt)}` : ""}`} />
                  ))}
                </div>
              ) : (
                <p className="small" style={{ marginTop: 8 }}>Aucun relevé de ton abonnement pour l&apos;instant. Le suivi complet est dans Claude : <span className="mono">Paramètres → Utilisation</span> sur claude.ai, ou <span className="mono">/usage</span> dans Claude Code.</p>
              )}
              <p className="muted small" style={{ marginTop: 8 }}>{checkedAt ? `Relevé ${generatedAtLabel(checkedAt)}` : "Pas encore de relevé complet"} : lu sur ton compte Claude sans consommer de quota, au plus toutes les 5 min quand un invité ouvre une page, et après chaque appel du coach. Il compte toute ton utilisation de Claude, ailleurs comprise.{rateLimit?.status === "rejected" ? " Dernier appel du coach refusé : limite atteinte." : ""}</p>
            </section>
          </div>
        </SettingsGroup>
        <SettingsGroup id="acces" title="Accès et connexions" note="ouverture aux invités depuis l'extérieur, plafond commun, journal des connexions" badge={admin.accessBadge} icon={Globe} accent="orange">
          {admin.access}
        </SettingsGroup>
        <SettingsGroup id="consommation" title="Ta consommation" note="analyses, conseils et questions ; derniers appels et moyennes" badge={`aujourd'hui ${tokens(summary.today.totalTokens)}`} icon={BarChart3} accent="green">
          <p className="section-note" style={{ marginTop: -6 }}>{first ? `suivi depuis le ${formatDate(first.createdAt, "long")}` : "suivi démarré : aucun appel enregistré pour l'instant"}</p>
          <div className="grid grid-3">
            <TotalsCard title="Aujourd'hui" totals={summary.today} />
            <TotalsCard title="7 derniers jours" totals={summary.last7Days} />
            <TotalsCard title="30 derniers jours" totals={summary.last30Days} />
          </div>
          <div className="grid grid-main-side">
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
        </SettingsGroup>
        <SettingsGroup id="controle" title="Contrôle des analyses" note="règles vérifiées en code après chaque analyse, et relecture IA par lots ; jamais visible des invités" badge={admin.qualityBadge} icon={ShieldCheck} accent="yellow">
          {admin.quality}
        </SettingsGroup>
        <SettingsGroup id="reglage" title="Bilan et banc de tests" note="outils de réglage du coach, comptés à part de ton usage" badge={pending.length ? `${pending.length} en attente` : null} icon={FlaskConical} accent="blue">
          <p className="section-note" style={{ marginTop: -6 }}>plafonds : {tokens(budget.nightTokens)} par lancement, {tokens(budget.weekTokens)} sur 7 jours</p>
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
        </SettingsGroup>
      </div>
    </>
  );
}
