import { Bot, EyeOff, HardDrive, Trash2 } from "lucide-react";

/**
 * Ce que deviennent les données d'un invité, dit exactement : stockage sur le Mac
 * de Bastien, synthèses envoyées à Claude via son compte personnel, engagement (et
 * non impossibilité) de ne pas consulter. Rien n'est affirmé sur l'entraînement des
 * modèles tant que Bastien n'a pas confirmé avoir désactivé le réglage.
 */
export function PrivacyNotice({ trainingOptOut }: { trainingOptOut: boolean }) {
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
        <li><EyeOff size={15} /> <span>L&apos;application ne montre à Bastien ni tes séances, ni tes échanges avec le coach : seulement ta consommation du coach et la liste de tes connexions. Les fichiers étant sur son ordinateur, il pourrait techniquement y accéder ; il s&apos;engage à ne pas le faire.</span></li>
        <li><Trash2 size={15} /> <span>Sur simple demande, Bastien supprime ton profil et toutes tes données.</span></li>
      </ul>
    </section>
  );
}
