import { describe, expect, it } from "vitest";
import { emphasize } from "./emphasis";

/** Les segments marqués, dans l'ordre. */
function keys(text: string): string[] {
  return emphasize(text).filter((part) => part.key).map((part) => part.text);
}

describe("consigne clé mise en évidence", () => {
  it("conseil du jour : la séance proposée, pas la séance passée ni la sortie longue sans chiffre", () => {
    expect(keys("Ton levier pour le semi est la fréquence (1,4 sortie par semaine, repère 3) : après ton fractionné court 14 × 30 s, ce footing de 35 min ajoute une sortie sans fatiguer, avant la sortie longue de samedi.")).toEqual(["footing de 35 min"]);
  });

  it("consigne d'exécution : allure et FC, jamais la comparaison", () => {
    expect(keys("Pars à 6:49/km, comme ton endurance du 7 nov. : reste entre 130 et 140 bpm, ne dépasse pas 140 bpm, et finis aussi facile que tu as commencé sur les 35 min.")).toEqual(["6:49/km", "130 et 140 bpm"]);
  });

  it("prochaine fois : le format complet et sa cible", () => {
    expect(keys("Ajoute une répétition : 4 × 2 km à 4:07–4:14/km, avec 1:45 de récupération.")).toEqual(["4 × 2 km à 4:07–4:14/km"]);
  });

  it("lien à l'objectif : la séance à ajouter en entier", () => {
    expect(keys("Cette séance ne travaille pas ton levier principal, les sorties par semaine (1,4, repère 3 au moins) : ajoute un footing facile de 30 à 40 min en Z2 pour passer à 2 sorties.")).toEqual(["footing facile de 30 à 40 min en Z2"]);
  });

  it("cible avec zone entre parenthèses : gardée entière", () => {
    expect(keys("Rien à corriger : tu étais dans la cible 4:07–4:14/km, 164–171 bpm (Z4–Z5).")).toEqual(["4:07–4:14/km, 164–171 bpm (Z4–Z5)"]);
  });

  it("écarts, comparaisons et volumes hebdomadaires ne sont pas des consignes", () => {
    expect(keys("Répétitions à 4:10/km contre 4:02/km, 8 s/km plus lentes, 13 km/sem.")).toEqual(["4:10/km"]);
    expect(keys("Garde la régularité, sans chercher plus vite.")).toEqual([]);
  });

  it("séance déjà faite, plus longue passée et pas de progression : jamais marqués", () => {
    expect(keys("Pour le semi, avec 2 sorties par semaine : une de qualité, une longue. La qualité est faite (fractionné court 14 × 30 s) : c'est le tour de la sortie longue (13 km), en Z2.")).toEqual(["sortie longue (13 km), en Z2"]);
    expect(keys("13 km en continu et réguliers (ta plus longue des 8 dernières semaines : 11 km).")).toEqual(["13 km"]);
    expect(keys("Passe à 2 sorties par semaine : ajoute un footing facile de 30 à 40 min en Z2 ; ensuite, allonge ta sortie longue de 2 km toutes les 2 semaines (11 → 18 km en 8 semaines).")).toEqual(["footing facile de 30 à 40 min en Z2"]);
  });

  it("carte forme aérobie : la séance à ajouter", () => {
    expect(keys("Continue sur cette lancée ; pour ton 10 km, le prochain pas : ajoute un footing facile en Z2 pour passer à 2 sorties par semaine.")).toEqual(["footing facile en Z2"]);
  });

  it("palier de distance : la distance visée, pas l'incrément", () => {
    expect(keys("Prochain palier : 7 km d'une traite, en facile (1 km de plus que ta plus longue).")).toEqual(["7 km"]);
  });

  it("le texte reste identique une fois recollé", () => {
    const text = "Pour le semi, avec 2 sorties par semaine : une de qualité, une longue. C'est le tour de la sortie longue (13 km), en Z2.";
    expect(emphasize(text).map((part) => part.text).join("")).toBe(text);
    expect(keys(text)).toEqual(["sortie longue (13 km), en Z2"]);
  });
});
