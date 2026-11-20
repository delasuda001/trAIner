/**
 * Garde-fou « Claude n'invente aucun chiffre » : chaque nombre présent dans
 * le texte généré doit figurer dans la charge utile envoyée (au besoin
 * arrondi). Les petits entiers (1 à 12) sont tolérés : « 3 répétitions »,
 * « 2e moitié », « Z4 ».
 */

const NUMBER_PATTERN = /\d+:\d{2}(?::\d{2})?|\d+(?:[.,]\d+)?/g;
const FREE_INTEGER_MAX = 12;

function toValues(token: string): number[] {
  if (token.includes(":")) {
    return [token.split(":").map(Number).reduce((total, part) => total * 60 + part, 0)];
  }
  return [Number(token.replace(",", "."))];
}

function keyOf(token: string): string {
  return token.includes(":") ? `t${toValues(token)[0]}` : `n${Number(token.replace(",", "."))}`;
}

export function extractNumberTokens(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === "string") into.push(value);
  else if (typeof value === "number") into.push(String(value));
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, into));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, into));
}

/** Chiffres autorisés = valeurs ET libellés de la charge utile (« seances_de_qualite_14_jours » autorise « 14 jours »). */
function collectAll(value: unknown, into: string[]): void {
  collectStrings(value, into);
  const visit = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") Object.entries(node).forEach(([key, child]) => { into.push(key.replace(/_/g, " ")); visit(child); });
  };
  visit(value);
}

/** Contexte autour d'un chiffre refusé, pour comprendre les refus dans les journaux. */
export function excerpt(text: string, token: string): string {
  const index = text.indexOf(token);
  return index < 0 ? token : `…${text.slice(Math.max(0, index - 40), index + token.length + 20).replace(/\s+/g, " ")}…`;
}

export function allowedNumbers(payload: unknown): Set<string> {
  const strings: string[] = [];
  collectAll(payload, strings);
  const allowed = new Set<string>();
  for (const text of strings) {
    for (const token of extractNumberTokens(text)) {
      allowed.add(keyOf(token));
      if (!token.includes(":")) {
        const value = Number(token.replace(",", "."));
        allowed.add(`n${Math.round(value)}`);
        allowed.add(`n${Math.round(value * 10) / 10}`);
      }
    }
  }
  return allowed;
}

/** Nombres du texte absents de la charge utile. */
export function findUnsupportedNumbers(text: string, allowed: Set<string>): string[] {
  const unknown: string[] = [];
  for (const token of extractNumberTokens(text)) {
    if (!token.includes(":") && Number.isInteger(Number(token)) && Number(token) <= FREE_INTEGER_MAX) continue;
    if (!allowed.has(keyOf(token))) unknown.push(token);
  }
  return [...new Set(unknown)];
}

export function collectText(value: unknown): string {
  const strings: string[] = [];
  collectStrings(value, strings);
  return strings.join("\n");
}

/**
 * Zones contradictoires : « 165 bpm … en Z5 » alors que 165 bpm est en Z4.
 * On contrôle les FC suivies de près par une zone (même proposition).
 */
export function findZoneContradictions(text: string, zoneOf: (heartRate: number) => number): string[] {
  const issues: string[] = [];
  const pattern = /(\d{2,3})\s*bpm[^.;:\n]{0,30}?\b(?:Z|zone\s*)([1-5])(?:\s*[–-]\s*Z?([1-5]))?\b/gi;
  for (const match of text.matchAll(pattern)) {
    const heartRate = Number(match[1]);
    const claimed = Number(match[2]);
    // « Z3–Z4 » : une plage de zones accepte toute FC comprise dans la plage.
    const claimedHigh = match[3] ? Number(match[3]) : claimed;
    const zone = zoneOf(heartRate);
    // « 128–148 bpm (Z2) » : la borne haute d'une plage est vérifiée comme les autres.
    if (zone < claimed || zone > claimedHigh) issues.push(`${heartRate} bpm n'est pas en Z${claimed}${claimedHigh !== claimed ? `–Z${claimedHigh}` : ""}`);
  }
  return [...new Set(issues)];
}

const MULTIPLE_PATTERN = /(\d+(?:[.,]\d+)?)\s*fois\b/gi;

/**
 * Multiples recalculés : « 1,2 fois la moyenne » n'est accepté que si la charge
 * utile contient elle-même « 1,2 fois » (un ratio fourni), pas seulement le nombre
 * 1,2 ailleurs. Claude ne calcule aucun ratio.
 */
export function findUnsupportedMultiples(text: string, payload: unknown): string[] {
  const source = collectText(payload);
  const allowed = new Set([...source.matchAll(MULTIPLE_PATTERN)].map((match) => match[1].replace(".", ",")));
  const issues: string[] = [];
  for (const match of text.matchAll(MULTIPLE_PATTERN)) {
    const value = match[1].replace(".", ",");
    // « 2 fois » ou « 3 fois » au sens de répétition (petits entiers) restent libres.
    if (!value.includes(",") && Number(value) <= 3) continue;
    if (!allowed.has(value)) issues.push(`${value} fois (ratio non fourni)`);
  }
  return [...new Set(issues)];
}

const CAUSE_PATTERN = /\b(cause probable|à cause d[eu']|parce qu|en raison d[eu']|s'explique par|est dûe? à|est due à|trop (?:rapide|vite) pour tenir)/gi;

/**
 * Causes non fournies : quand la charge utile dit « causes_possibles: aucune », toute
 * tournure causale absente de la charge utile est refusée (Claude n'invente pas d'explication).
 */
export function findUnsupportedCauses(text: string, payload: unknown): string[] {
  if (typeof payload !== "object" || payload == null || (payload as Record<string, unknown>).causes_possibles !== "aucune") return [];
  const source = collectText(payload).toLowerCase();
  const issues = [...text.matchAll(CAUSE_PATTERN)].map((match) => match[1]).filter((phrase) => !source.includes(phrase.toLowerCase()));
  return [...new Set(issues)].map((phrase) => `« ${phrase} » (aucune cause fournie)`);
}

/**
 * Jugement d'état global de la personne (ADR-004 : pas d'interprétation de fatigue ou de forme) :
 * « vous étiez frais », « tu es fatigué », « en pleine forme »… Les constats chiffrés (VFC, sommeil)
 * restent permis ; c'est la conclusion sur la personne qui est refusée.
 */
const STATE_PATTERN = /\b(?:(?:vous|tu)\s+(?:étiez|êtes|étais|es|semblez|sembles|paraissez|parais)\s+(?:bien\s+|plutôt\s+|très\s+|encore\s+)?(frais|fraîche|fatigué(?:e|s)?|reposé(?:e|s)?|épuisé(?:e|s)?|en forme|cuit(?:e)?|émoussé(?:e)?)|(en pleine forme|en surentraînement|surentraîné(?:e)?))/gi;

export function findStateJudgements(text: string): string[] {
  const issues = [...text.matchAll(STATE_PATTERN)].map((match) => match[0]);
  return [...new Set(issues)].map((phrase) => `« ${phrase} » (jugement d'état de la personne, interdit)`);
}
