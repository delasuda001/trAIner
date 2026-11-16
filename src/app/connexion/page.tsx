import { redirect } from "next/navigation";
import { LoginForm } from "@/components/profiles/login-form";
import { BRAND } from "@/lib/brand";
import { requestMember } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

const INVITATION_NOTES: Record<string, string> = {
  invalide: "Ce lien d'invitation a déjà servi ou a expiré. Saisis ton code, ou demande un nouveau lien à Bastien.",
  bloquee: "Trop d'essais depuis cet appareil : réessaie dans un quart d'heure.",
};

/** Page publique : aucune donnée, aucun nom de profil. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invitation?: string }> }) {
  if (await requestMember()) redirect("/");
  const note = INVITATION_NOTES[(await searchParams).invitation ?? ""] ?? null;
  return (
    <div className="login-wrap rise">
      <div className="card login-card">
        <p className="eyebrow">{BRAND.name}</p>
        <h1 className="page-title" style={{ fontSize: 30 }}>Bienvenue</h1>
        <p className="page-sub">Ouvre le lien personnel que Bastien t&apos;a envoyé, ou saisis ton code d&apos;accès.</p>
        {note ? <p className="notice" role="status" style={{ marginTop: 12 }}>{note}</p> : null}
        <LoginForm />
      </div>
    </div>
  );
}
