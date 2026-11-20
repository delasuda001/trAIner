/**
 * Clin d'œil personnalisé : profils qui ont des petits cœurs dans l'en-tête et une arrivée fêtée.
 * Demande de Bastien, pour Marie seulement ; aucun autre profil n'est touché.
 */
export const CELEBRATED_PROFILES: ReadonlySet<string> = new Set(["marie"]);

export const CELEBRATION_NICKNAMES = ["chouchou d'amour", "chat", "mon cœur", "ma chérie", "belle gosse"] as const;
export const CELEBRATION_OPENERS = ["Let's go", "Bravo"] as const;

export function celebrated(profileId: string | null | undefined): boolean {
  return profileId != null && CELEBRATED_PROFILES.has(profileId);
}

/** Message tiré au hasard (`random` dans [0, 1[ fourni pour les tests). */
export function celebrationMessage(random: () => number = Math.random): string {
  const opener = CELEBRATION_OPENERS[Math.floor(random() * CELEBRATION_OPENERS.length)];
  const nickname = CELEBRATION_NICKNAMES[Math.floor(random() * CELEBRATION_NICKNAMES.length)];
  return `${opener} ${nickname} !`;
}
