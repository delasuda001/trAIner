import { redirect } from "next/navigation";
import { LoginForm } from "@/components/profiles/login-form";
import { BRAND } from "@/lib/brand";
import { requestMember } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

const INVITATION_NOTES: Record<string, string> = {
  invalide: "Ce lien n'est plus nécessaire : entrez simplement votre prénom et votre code personnel.",
  bloquee: "Trop d'essais depuis cet appareil : merci de réessayer dans un quart d'heure.",
};

/** Page publique, la même adresse pour tous : aucune donnée, aucune liste de profils (le prénom est tapé). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invitation?: string }> }) {
  if (await requestMember()) redirect("/");
  const note = INVITATION_NOTES[(await searchParams).invitation ?? ""] ?? null;
  return (
    <div className="login-wrap rise">
      <div className="card login-card">
        <p className="eyebrow">{BRAND.name}</p>
        <h1 className="page-title" style={{ fontSize: 30 }}>Bienvenue</h1>
        <p className="page-sub">Entrez votre prénom et le code personnel que Bastien vous a donné. Une seule fois par appareil : ensuite, Sillage s&apos;ouvre directement.</p>
        {note ? <p className="notice" role="status" style={{ marginTop: 12 }}>{note}</p> : null}
        <LoginForm />
      </div>
    </div>
  );
}
