import { MessageSquarePlus, ThumbsUp } from "lucide-react";
import { InstallHint, WelcomeDone } from "@/components/profiles/welcome-steps";
import { DEFAULT_GUEST_DAILY_CAP } from "@/lib/profiles/types";
import { getRegistry } from "@/lib/profiles/context";
import { asMember } from "@/lib/profiles/request";
import { readGoal } from "@/lib/server/analytics";

export const dynamic = "force-dynamic";

/** Accueil d'un testeur : ce qu'est le test, ses limites, comment faire un retour, l'écran d'accueil, puis l'objectif. */
export default async function WelcomePage() {
  return asMember((member) => {
    const record = getRegistry().find(member.id);
    const perDay = Math.max(1, Math.floor((record?.dailyTokenCap ?? DEFAULT_GUEST_DAILY_CAP) / 10_000));
    const hasGoal = readGoal() != null;
    return (
      <div className="welcome rise">
        <p className="eyebrow">Bienvenue</p>
        <h1 className="page-title">Bonjour {member.name} !</h1>
        <p className="page-sub">Bastien construit Sillage, un coach de course à pied qui lit les données de ta montre Garmin. Tu fais partie des premiers testeurs : ton avis compte vraiment.</p>

        <section className="card welcome-card">
          <h2 className="section-title">Ce que fait l&apos;application</h2>
          <ul className="bullets">
            <li>Elle récupère tes séances Garmin des 12 derniers mois et calcule, pour chacune, ce qui s&apos;est bien passé et ce qui est à travailler.</li>
            <li>Elle te propose ta prochaine séance et suit ta progression à fréquence cardiaque égale.</li>
            <li>Tes données ne sont visibles que par toi. Bastien voit seulement si tu utilises le coach, et tes retours.</li>
          </ul>
        </section>

        <section className="card welcome-card">
          <h2 className="section-title">Le coach, avec modération</h2>
          <p className="small">Les chiffres sont toujours affichés. Le commentaire du coach (Claude) se demande d&apos;un bouton et compte dans une limite du test : environ {perDay} analyses ou questions par jour. Une analyse déjà faite se relit sans limite.</p>
        </section>

        <section className="card welcome-card">
          <h2 className="section-title">Ton avis, en un geste</h2>
          <p className="small"><MessageSquarePlus size={14} /> Le bouton <strong>« Un retour ? »</strong>, en bas à droite de chaque page : écris ce qui te manque, ce qui est confus, ce qui t&apos;aiderait. <ThumbsUp size={14} /> Sous chaque analyse du coach, un pouce pour dire si elle t&apos;a servi.</p>
        </section>

        <section className="card welcome-card">
          <h2 className="section-title">L&apos;avoir sur ton téléphone</h2>
          <InstallHint />
        </section>

        <section className="card welcome-card">
          <h2 className="section-title">Pour finir : ton objectif</h2>
          <p className="small">{hasGoal ? "Ton objectif est déjà renseigné." : "Indique ta prochaine course ou ce que tu vises : le coach s'en sert pour choisir tes séances. Tout est facultatif, et l'application fonctionne sans."}</p>
          <WelcomeDone hasGoal={hasGoal} />
        </section>
      </div>
    );
  });
}
