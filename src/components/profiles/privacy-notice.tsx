import { Bot, Eye, HardDrive, Trash2 } from "lucide-react";

/**
 * Ce que deviennent les données d'un invité, dit exactement : stockage sur le Mac
 * de Bastien, synthèses envoyées à Claude via son compte personnel, ouverture possible
 * de l'espace par Bastien en lecture seule (« voir comme », accepté par les invités), notée et montrée. Rien n'est affirmé sur l'entraînement des
 * modèles tant que Bastien n'a pas confirmé avoir désactivé le réglage.
 */
/** `viewLog` : ouvertures de l'espace par Bastien (« voir comme »), plus récentes d'abord ; montrées à l'invité. */
export function PrivacyNotice({ trainingOptOut, viewLog }: { trainingOptOut: boolean; viewLog?: string[] }) {
  return (
    <section className="card welcome-card welcome-privacy">
      <h2 className="section-title">Tes données</h2>
      <ul className="welcome-list">
        <li><HardDrive size={15} /> <span>Tes données Garmin sont copiées et stockées sur l&apos;ordinateur de Bastien (un Mac), où fonctionne Sillage. Elles ne sont ni publiées, ni transmises à d&apos;autres personnes.</span></li>
        <li>
          <Bot size={15} />
          <span>
            Pour les commentaires du coach, Sillage envoie à Claude, l&apos;assistant de la société Anthropic, des synthèses chiffrées de tes séances, jamais ta trace GPS. Ces échanges passent par le compte Claude personnel de Bastien.{" "}
            {trainingOptOut
              ? "Bastien a désactivé sur ce compte l'option « Aider à améliorer Claude » : selon les conditions d'Anthropic, ces échanges ne servent pas à entraîner ses modèles."
              : <>Leur usage par Anthropic suit les règles applicables aux comptes Claude personnels (<a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">politique de confidentialité d&apos;Anthropic</a>).</>}
          </span>
        </li>
        <li>
          <Eye size={15} />
          <span>
            Bastien peut ouvrir ton espace tel que tu le vois, en lecture seule, pour t&apos;aider ou vérifier un problème : il y voit alors tes séances, les analyses et tes échanges avec le coach. Il ne peut rien y modifier ni rien envoyer en ton nom, et chaque ouverture est notée ici.
            {viewLog ? (viewLog.length ? <> Dernières ouvertures : {viewLog.slice(0, 5).map((iso) => new Date(iso).toLocaleString("fr-FR", { timeZone: "America/Toronto", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })).join(", ")} (heure de Toronto).</> : " Aucune ouverture pour l'instant.") : null}
          </span>
        </li>
        <li><Trash2 size={15} /> <span>Sur simple demande, Bastien supprime ton profil et toutes tes données.</span></li>
      </ul>
    </section>
  );
}
