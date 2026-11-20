import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { looksLikeToken } from "@/lib/profiles/credentials";
import { requestMember } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

/**
 * Étape de confirmation du lien d'invitation. Le lien seul (GET) ne consomme plus
 * rien : les robots d'aperçu des messageries l'ouvrent avant la personne invitée.
 * Seul l'envoi du formulaire (POST) utilise le lien et ouvre la session.
 * Page publique : aucune donnée, aucun nom de profil.
 */
export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  if (await requestMember()) redirect("/");
  const token = (await searchParams).t ?? null;
  if (!looksLikeToken(token)) redirect("/connexion?invitation=invalide");
  return (
    <div className="login-wrap rise">
      <div className="card login-card">
        <p className="eyebrow">{BRAND.name}</p>
        <h1 className="page-title" style={{ fontSize: 30 }}>Bienvenue</h1>
        <p className="page-sub">Ton lien personnel est prêt : il ouvre {BRAND.name} sur cet appareil. Pour tes autres appareils, plus besoin de lien : la même adresse, ton prénom et ton code suffisent.</p>
        <form method="post" action="/api/session/invitation" style={{ marginTop: 16 }}>
          <input type="hidden" name="t" value={token} />
          <button className="btn btn-primary" type="submit">Ouvrir {BRAND.name} sur cet appareil</button>
        </form>
      </div>
    </div>
  );
}
