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

export function allowedNumbers(payload: unknown): Set<string> {
  const strings: string[] = [];
  collectStrings(payload, strings);
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
  const pattern = /(\d{2,3})\s*bpm[^.;:\n]{0,30}?\b(?:Z|zone\s*)([1-5])\b/gi;
  for (const match of text.matchAll(pattern)) {
    const heartRate = Number(match[1]);
    const claimed = Number(match[2]);
    // « 128–148 bpm (Z2) » : la borne haute d'une plage est vérifiée comme les autres.
    if (zoneOf(heartRate) !== claimed) issues.push(`${heartRate} bpm n'est pas en Z${claimed}`);
  }
  return [...new Set(issues)];
}
