/**
 * Visite guidée de premier lancement : accueil, coach, objectif.
 *
 * Le « déjà vu » est gardé par profil dans le registre (`tour_seen_<id>`, date ISO), pas sur
 * l'appareil : un invité qui ouvre Sillage sur un second téléphone ne la revoit pas. Elle
 * revient si Bastien réinitialise l'accueil du profil (`guide_reset_<id>` plus récent), et se
 * rejoue à volonté depuis Paramètres (sans toucher au « déjà vu »).
 */

export function tourSeenKey(profileId: string): string {
  return `tour_seen_${profileId}`;
}

/** À montrer d'office : jamais vue, ou vue avant une réinitialisation de l'accueil. */
export function shouldShowTour(seenAt: string | null, resetAt: string | null): boolean {
  if (seenAt == null) return true;
  if (resetAt == null) return false;
  return Date.parse(seenAt) < Date.parse(resetAt);
}

/** Pages où la visite ne s'ouvre jamais d'office : connexion et accueil du testeur ont leur propre parcours. */
const QUIET_PATHS = ["/connexion", "/bienvenue"];

export function tourAllowedOn(pathname: string): boolean {
  return !QUIET_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Prénom d'affichage : première lettre en capitale, le reste tel quel (« benoît » → « Benoît »). */
export function displayFirstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first ? first.charAt(0).toLocaleUpperCase("fr-FR") + first.slice(1) : "";
}

export type TourStepId = "intro" | "home" | "coach" | "goal" | "end";

export type TourStep = {
  id: TourStepId;
  /** Onglet de navigation mis en avant pendant l'étape. */
  tab: "/" | "/coach" | "/objectif" | null;
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
};

/** Typographie française : espace insécable avant « : ; ? ! » et à l'intérieur des guillemets. */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([:;?!»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");
}

/** Textes de la visite (tutoiement, prénom), le seul endroit à relire pour les changer. */
export function tourSteps(firstName: string, guest: boolean): TourStep[] {
  return rawSteps(firstName, guest).map((step) => ({ ...step, title: frenchSpacing(step.title), lead: frenchSpacing(step.lead), points: step.points.map(frenchSpacing) }));
}

function rawSteps(firstName: string, guest: boolean): TourStep[] {
  const name = firstName ? `, ${firstName}` : "";
  return [
    {
      id: "intro",
      tab: null,
      eyebrow: "Visite guidée · 1 minute",
      title: `Bienvenue${name}.`,
      lead: "Sillage lit tes courses Garmin, les compare à tes propres repères et te dit quoi faire ensuite. Trois escales pour t'y retrouver.",
      points: [],
    },
    {
      id: "home",
      tab: "/",
      eyebrow: "Escale 1 sur 3 · Accueil",
      title: "Ta prochaine séance, chaque jour.",
      lead: "Le tableau de bord répond d'abord à une question : qu'est-ce que je cours ensuite ?",
      points: [
        "La carte jaune dit quoi courir, combien de temps et à quelle fréquence cardiaque.",
        "Le calendrier colore chaque jour selon l'intensité ; touche une séance pour son analyse.",
        "Les jauges de l'objectif : la plus courte est ton meilleur levier.",
      ],
    },
    {
      id: "coach",
      tab: "/coach",
      eyebrow: "Escale 2 sur 3 · Coach",
      title: "Pose ta question, il répond avec tes chiffres.",
      lead: "Le coach connaît tes séances, ton objectif et ton ressenti. Il ne devine pas : il s'appuie sur ce que ta montre a mesuré.",
      points: [
        "Il cite les séances qu'il a utilisées et sépare ce qui est mesuré de ce qui est supposé.",
        "Chaque séance peut aussi être analysée depuis sa propre page.",
        guest
          ? "Il partage l'abonnement de Bastien : la jauge sous chaque bouton dit s'il est disponible."
          : "Une réponse déjà donnée se relit à volonté, sans rien consommer.",
      ],
    },
    {
      id: "goal",
      tab: "/objectif",
      eyebrow: "Escale 3 sur 3 · Objectif",
      title: "Fixe un cap, mesure l'écart.",
      lead: "Une course et un chrono, ou simplement de la régularité : c'est facultatif, mais tout s'aligne dessus.",
      points: [
        "« Où tu en es » compare ton allure du moment à ta cible.",
        "Les leviers montrent ce qui te rapproche le plus : sorties, volume, sortie longue.",
        "La prochaine séance proposée en tient compte.",
      ],
    },
    {
      id: "end",
      tab: null,
      eyebrow: "C'est prêt",
      title: `À toi de jouer${name}.`,
      lead: "Cette visite se rejoue quand tu veux depuis Paramètres. Une idée, un doute ? Le bouton « Un retour ? » est sur chaque page.",
      points: [],
    },
  ];
}
