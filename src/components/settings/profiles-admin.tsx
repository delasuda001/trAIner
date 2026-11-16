"use client";

import { Copy, KeyRound, Link2, ShieldOff, Smartphone, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type DeviceView = { id: string; device: string; lastSeenAt: string };

export type ProfileView = {
  id: string;
  name: string;
  role: "admin" | "guest";
  garminEnvVar: string;
  garminPresent: boolean;
  usedToday: number;
  usedWeek: number;
  dailyCap: number | null;
  weeklyCap: number | null;
  devices: DeviceView[];
  lastLoginAt: string | null;
  disabled: boolean;
  invitationUntil: string | null;
  onboarded: boolean;
  hasCode: boolean;
};

type Secret = { title: string; lines: Array<{ label: string; value: string }>; note: string };

function tokens(value: number): string {
  return value >= 10_000 ? `${Math.round(value / 1000)} k` : String(value);
}

function when(iso: string | null): string {
  if (!iso) return "jamais";
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function post(url: string, body: unknown): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(typeof json?.error === "string" ? json.error : "Action impossible.");
  return json;
}

function SecretBox({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="secret-box" role="dialog" aria-label={secret.title}>
      <strong>{secret.title}</strong>
      {secret.lines.map((line) => (
        <div key={line.label} className="secret-line">
          <span className="fact-label">{line.label}</span>
          <code className="secret-value">{line.value}</code>
          <button type="button" className="btn btn-ghost" onClick={() => { void navigator.clipboard?.writeText(line.value); setCopied(line.label); }}><Copy size={13} /> {copied === line.label ? "Copié" : "Copier"}</button>
        </div>
      ))}
      <p className="muted small">{secret.note}</p>
      <button type="button" className="btn" onClick={onClose}>J&apos;ai transmis, masquer</button>
    </div>
  );
}

function CapsEditor({ profile, onSaved }: { profile: ProfileView; onSaved: () => void }) {
  const [daily, setDaily] = useState(String(Math.round((profile.dailyCap ?? 0) / 1000)));
  const [weekly, setWeekly] = useState(String(Math.round((profile.weeklyCap ?? 0) / 1000)));
  const [state, setState] = useState<string | null>(null);
  async function save() {
    try {
      await post(`/api/profiles/${profile.id}`, { action: "caps", caps: { dailyTokenCap: Math.max(0, Number(daily) || 0) * 1000, weeklyTokenCap: Math.max(0, Number(weekly) || 0) * 1000 } });
      setState("Enregistré");
      onSaved();
    } catch (error) {
      setState((error as Error).message);
    }
  }
  return (
    <div className="caps-editor">
      <label className="field"><span>Plafond / jour (k)</span><input inputMode="numeric" value={daily} onChange={(event) => setDaily(event.target.value)} /></label>
      <label className="field"><span>Plafond / 7 jours (k)</span><input inputMode="numeric" value={weekly} onChange={(event) => setWeekly(event.target.value)} /></label>
      <button type="button" className="btn" onClick={() => void save()}>Enregistrer</button>
      {state ? <span className="muted small">{state}</span> : null}
    </div>
  );
}

function ProfileCard({ profile, onSecret }: { profile: ProfileView; onSecret: (secret: Secret) => void }) {
  const router = useRouter();
  const [garmin, setGarmin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guest = profile.role === "guest";

  async function act(body: { action: string }, after?: (json: Record<string, unknown> | null) => void) {
    setError(null);
    try {
      const json = await post(`/api/profiles/${profile.id}`, body);
      after?.(json);
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  async function revoke(deviceId: string) {
    await fetch(`/api/profiles/sessions/${deviceId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <article className={`card profile-card${profile.disabled ? " is-disabled" : ""}`}>
      <div className="row-between">
        <h3 className="section-title" style={{ fontSize: 20 }}>{profile.name} <span className="muted small">· {guest ? "invité" : "administrateur"}{profile.disabled ? " · désactivé" : ""}</span></h3>
        <span className="muted small">dernière connexion : {when(profile.lastLoginAt)}</span>
      </div>

      <div className="profile-grid">
        <div>
          <div className="fact-label">Clé Garmin</div>
          <p className="small" style={{ margin: "4px 0" }}>
            Variable <code>{profile.garminEnvVar}</code> dans <code>.env.local</code> : {profile.garminPresent ? <strong>détectée</strong> : <strong className="text-warning">absente</strong>}{garmin ? ` · ${garmin}` : ""}
          </p>
          {profile.garminPresent ? (
            <button type="button" className="btn btn-ghost" onClick={() => void act({ action: "check-garmin" }, (json) => setGarmin(json?.valid === true ? "valide (jeton obtenu)" : `refusée${typeof json?.error === "string" ? ` : ${json.error}` : ""}`))}>Vérifier la clé</button>
          ) : <p className="muted small">Ajoute la ligne <code>{profile.garminEnvVar}=…</code> à <code>.env.local</code> puis clique sur « Vérifier » : pas besoin de relancer l&apos;application.</p>}
        </div>

        <div>
          <div className="fact-label">Consommation du coach</div>
          <p className="small" style={{ margin: "4px 0" }}>
            Aujourd&apos;hui <strong className="num">{tokens(profile.usedToday)}</strong>{profile.dailyCap != null ? ` / ${tokens(profile.dailyCap)}` : ""} · 7 jours <strong className="num">{tokens(profile.usedWeek)}</strong>{profile.weeklyCap != null ? ` / ${tokens(profile.weeklyCap)}` : ""} tokens
          </p>
          {guest ? <CapsEditor profile={profile} onSaved={() => router.refresh()} /> : <p className="muted small">Pas de plafond pour toi ; le banc garde les siens.</p>}
        </div>

        <div>
          <div className="fact-label">Appareils connectés ({profile.devices.length})</div>
          {profile.devices.length ? (
            <ul className="device-list">
              {profile.devices.map((device) => (
                <li key={device.id}><Smartphone size={13} /> {device.device} <span className="muted small">· vu {when(device.lastSeenAt)}</span> <button type="button" className="btn btn-ghost" onClick={() => void revoke(device.id)}>Déconnecter</button></li>
              ))}
            </ul>
          ) : <p className="muted small" style={{ margin: "4px 0" }}>Aucun.{profile.invitationUntil ? ` Lien d'invitation valable jusqu'au ${when(profile.invitationUntil)}.` : ""}</p>}
        </div>
      </div>

      <div className="profile-actions">
        <button type="button" className="btn" onClick={() => void act({ action: "invitation" }, (json) => onSecret({ title: `Lien d'invitation de ${profile.name}`, lines: [{ label: "Lien", value: String(json?.link ?? "") }], note: "À usage unique, valable 7 jours : il ouvre la session sur l'appareil où il est ouvert (à ouvrir dans Safari sur iPhone). Il remplace le lien précédent. Il ne sera plus affiché." }))}><Link2 size={14} /> Nouveau lien d&apos;invitation</button>
        <button type="button" className="btn btn-ghost" onClick={() => void act({ action: "code" }, (json) => onSecret({ title: `Code de secours de ${profile.name}`, lines: [{ label: "Code", value: String(json?.code ?? "") }], note: "Sert si l'application installée sur l'écran d'accueil redemande la connexion. Les appareils déjà connectés le restent. Il ne sera plus affiché." }))}><KeyRound size={14} /> {profile.hasCode ? "Nouveau code" : "Créer un code"}</button>
        {profile.devices.length ? <button type="button" className="btn btn-ghost" onClick={() => void act({ action: "revoke-all" })}>Déconnecter tous ses appareils</button> : null}
        {guest ? <button type="button" className="btn btn-ghost" onClick={() => void act({ action: profile.disabled ? "enable" : "disable" })}><ShieldOff size={14} /> {profile.disabled ? "Réactiver" : "Désactiver"}</button> : null}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </article>
  );
}

export function ProfilesAdmin({ profiles, publicUrlConfigured }: { profiles: ProfileView[]; publicUrlConfigured: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<Secret | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const json = await post("/api/profiles", { name });
      setSecret({
        title: `Profil « ${String(json?.name ?? name)} » créé`,
        lines: [{ label: "Lien d'invitation", value: String(json?.link ?? "") }, { label: "Code de secours", value: String(json?.code ?? "") }],
        note: `Envoie-lui le lien (usage unique, 7 jours) et garde le code pour le cas où l'application installée redemande la connexion. Sa clé Garmin : ajoute ${String(json?.garminEnvVar ?? "")}=… dans .env.local. Ni le lien ni le code ne seront réaffichés.`,
      });
      setName("");
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  return (
    <div className="stack">
      {secret ? <SecretBox secret={secret} onClose={() => setSecret(null)} /> : null}
      {!publicUrlConfigured ? <p className="notice">Adresse publique non renseignée (plus bas) : les liens d&apos;invitation utiliseront l&apos;adresse de ce navigateur. Renseigne d&apos;abord l&apos;adresse du tunnel.</p> : null}
      {profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} onSecret={setSecret} />)}
      <form className="card create-guest" onSubmit={(event) => void create(event)}>
        <label className="field">
          <span>Ajouter une personne</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Prénom affiché (ex. Papa)" maxLength={30} required />
        </label>
        <button type="submit" className="btn btn-primary" disabled={name.trim().length < 2}><UserPlus size={14} /> Créer le profil</button>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </div>
  );
}
