/**
 * Exemples cliquables d'objectif, de contexte pour le coach et de note de séance :
 * des coureurs confirmés comme débutants savent quoi écrire. Rien de médical.
 */

export type GoalExample = { label: string; title: string; distanceKm?: number; time?: string };

export const GOAL_EXAMPLES: GoalExample[] = [
  { label: "Marathon sous 3:30", title: "Marathon sous 3:30", distanceKm: 42.195, time: "3:30:00" },
  { label: "Record sur semi", title: "Battre mon record sur semi-marathon", distanceKm: 21.0975 },
  { label: "Trail de 30 km", title: "Préparer un trail de 30 km avec du dénivelé", distanceKm: 30 },
  { label: "Gros volume régulier", title: "Tenir 50 km par semaine, sans coupure" },
  { label: "10 km sous 50 min", title: "10 km sous 50 min", distanceKm: 10, time: "50:00" },
  { label: "Courir plus facilement", title: "Courir plus facilement en endurance" },
];

export const CONTEXT_EXAMPLES: string[] = [
  "Sortie longue plutôt le dimanche matin",
  "Club le mardi soir (fractionné sur piste)",
  "Terrain vallonné autour de chez moi",
  "Je fais aussi du vélo le week-end",
  "En semaine, 45 min maximum",
  "Je cours surtout seul, au feeling",
];

export const SESSION_NOTE_EXAMPLES: string[] = [
  "Jambes lourdes dès le début",
  "Vent de face au retour",
  "Grosse chaleur",
  "Mal dormi la veille",
  "Séance coupée avant la fin",
  "Parcours vallonné",
  "Je testais une allure",
  "Couru avec un ami, à son rythme",
];

/** Ajoute un exemple à une note libre sans doublon, séparé par « ; », dans la limite de longueur. */
export function appendExample(note: string, example: string, maxLength: number): string {
  const current = note.trim();
  if (current.toLowerCase().includes(example.toLowerCase())) return note;
  const next = current ? `${current.replace(/[;.,\s]+$/, "")} ; ${example}` : example;
  return next.length > maxLength ? note : next;
}
