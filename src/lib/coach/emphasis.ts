/**
 * Mise en évidence de la consigne clé dans un texte du coach (ou du moteur), sans appel
 * à Claude et sans toucher au texte : on repère les segments « prescriptifs » (type de
 * séance, durée, distance, allure, FC, zone) et on en garde au plus deux, ceux qui
 * ressemblent le plus à une consigne. Le reste du texte est rendu tel quel.
 *
 * Exclus : ce qui décrit le passé ou une comparaison (« après ton fractionné… »,
 * « contre 4:02/km », « comme ton endurance du 7 nov. »), les écarts (« 8 s/km »), les dates.
 */

export type TextPart = { text: string; key: boolean };

const SESSION = String.raw`(?:footing(?: facile| court)?|sortie (?:longue|facile)|endurance facile|séance (?:au seuil|de seuil|de qualité|facile)|fractionné(?: court| long)?|tempo|seuil)`;
const NUMBER = String.raw`\d+(?:[,.]\d+)?`;
const TOKEN_SOURCES = [
  // Répétitions : 4 × 2 km, 14 × 30 s, 3 × 10 min.
  String.raw`\d+ ?× ?${NUMBER} ?(?:km|min|s|m)\b`,
  // Allure, seule ou en fourchette : 4:07–4:14/km.
  String.raw`\d{1,2}:\d{2}(?: ?[–-] ?\d{1,2}:\d{2})?/km`,
  // FC : 140 bpm, 164–171 bpm, 130 et 140 bpm.
  String.raw`\d{2,3}(?: ?(?:[–-]| et | à ) ?\d{2,3})? bpm`,
  // Zones : Z2, Z4–Z5, (Z4–Z5).
  String.raw`\(?Z[1-5](?:[–-]Z?[1-5])?\)?`,
  // Durée ou distance : 35 min, 30 à 40 min, 13 km (mais pas « 8 s/km » ni « km/sem »).
  String.raw`${NUMBER}(?: à ${NUMBER})? ?(?:km|min)(?![/\w])`,
];
const SESSION_RE = new RegExp(SESSION, "gi");
const TOKEN_RE = new RegExp(TOKEN_SOURCES.join("|"), "g");
/** Ce qui peut relier deux éléments d'une même consigne : « footing facile de 35 min en Z2 ». */
const CONNECTOR_RE = /^(?:\s|,|\(|\)|·|de|d'|en|à|et|entre|avec|sur|:)*$/i;
/** Contexte juste avant le segment qui en fait un fait passé ou une comparaison. */
const PAST_RE = /(?:après (?:ton|ta|tes|votre|vos)|comme (?:ton|ta|tes|votre|vos)|contre|depuis|plus longue des|ta dernière|votre dernière|est faite|était)\s+(?:\S+\s+){0,4}\(?$/i;
/** « 11 → 18 km » : une projection entre parenthèses, pas la consigne ; « juste après » : un pas de progression (« de 2 km toutes les 2 semaines »), pas une séance. */
const STEP_AFTER_RE = /^\s*(?:toutes les|de plus)/i;
const MAX_KEYS = 2;

type Match = { start: number; end: number; session: boolean };

function matches(text: string): Match[] {
  const found: Match[] = [];
  for (const match of text.matchAll(SESSION_RE)) found.push({ start: match.index, end: match.index + match[0].length, session: true });
  for (const match of text.matchAll(TOKEN_RE)) found.push({ start: match.index, end: match.index + match[0].length, session: false });
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  // Pas de chevauchement : le premier (le plus long à départ égal) gagne.
  const clean: Match[] = [];
  for (const entry of found) if (!clean.length || entry.start >= (clean.at(-1) as Match).end) clean.push(entry);
  return clean;
}

type Span = { start: number; end: number; tokens: number; session: boolean; numeric: boolean };

function spans(text: string): Span[] {
  const result: Span[] = [];
  for (const match of matches(text)) {
    const last = result.at(-1);
    const gap = last ? text.slice(last.end, match.start) : null;
    if (last && gap != null && gap.length <= 12 && CONNECTOR_RE.test(gap)) {
      last.end = match.end;
      last.tokens += 1;
      last.session ||= match.session;
      last.numeric ||= !match.session;
    } else {
      result.push({ start: match.start, end: match.end, tokens: 1, session: match.session, numeric: !match.session });
    }
  }
  // Une consigne porte un chiffre ou une zone ; un mot de séance seul ne compte que faute de mieux (cf. fallbackSession).
  return result
    .map((span) => trimSpan(text, span))
    // « ton 10 km », « le semi » : le nom d'une course, pas une consigne.
    .filter((span) => !(span.tokens === 1 && /^\d+(?:[,.]\d+)? ?km$/.test(text.slice(span.start, span.end)) && /\b(?:ton|votre|le|du|un|ce)\s+$/i.test(text.slice(0, span.start))))
    .filter((span) => !PAST_RE.test(text.slice(Math.max(0, span.start - 50), span.start)) && !STEP_AFTER_RE.test(text.slice(span.end)) && !/(?:→|\bdure|\bdurait)\s*$/.test(text.slice(0, span.start)))
    .filter((span, _, all) => span.numeric || (!all.some((other) => other.numeric) && fallbackSession(text, span)));
}

/**
 * Sans aucune consigne chiffrée (« on récupère avec une sortie facile »), le type de séance proposé
 * suffit : en deux mots au moins (« sortie facile », « footing court »), jamais « seuil » seul ni la
 * séance d'un jour cité (« la sortie longue de samedi »).
 */
function fallbackSession(text: string, span: Span): boolean {
  const words = text.slice(span.start, span.end);
  return /\s/.test(words) && !/^\s*(?:de|du)\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i.test(text.slice(span.end));
}

/** Retire la ponctuation de bord (« , », parenthèse ouvrante sans fermante). */
function trimSpan(text: string, span: Span): Span {
  let { start, end } = span;
  while (start < end && /[\s,(:]/.test(text[start])) start += 1;
  while (end > start && /[\s,:]/.test(text[end - 1])) end -= 1;
  const inner = text.slice(start, end);
  if (inner.endsWith(")") && !inner.includes("(")) end -= 1;
  return { ...span, start, end };
}

/** Découpe un texte en parties, les consignes clés marquées `key` (deux au plus, dans l'ordre du texte). */
export function emphasize(text: string): TextPart[] {
  if (!text) return [];
  const ranked = spans(text)
    .map((span, index) => ({ span, index, score: (span.session ? 3 : 0) + span.tokens }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_KEYS)
    .map((entry) => entry.span)
    .sort((a, b) => a.start - b.start);
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const span of ranked) {
    if (span.start > cursor) parts.push({ text: text.slice(cursor, span.start), key: false });
    parts.push({ text: text.slice(span.start, span.end), key: true });
    cursor = span.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), key: false });
  return parts;
}
