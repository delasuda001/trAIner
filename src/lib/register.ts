/**
 * Registre de langue par profil : Bastien est tutoyé (textes historiques, inchangés),
 * les invités sont vouvoyés, sur un ton professionnel.
 *
 * Les phrases du moteur restent écrites au « tu » (photographie du moteur de Bastien
 * identique) ; `vouvoyer` les convertit pour un invité. Les règles couvrent les
 * gabarits du moteur (pronoms possessifs, impératifs en tête de proposition) et sont
 * vérifiées par les tests sur chacun d'eux. Les textes d'interface, eux, sont écrits
 * directement dans les deux registres (`say`).
 */
export type Register = "tu" | "vous";

export function registerForRole(role: string | null | undefined): Register {
  return role === "admin" ? "tu" : "vous";
}

export function say(register: Register, tu: string, vous: string): string {
  return register === "tu" ? tu : vous;
}

/** Impératifs (2e personne du singulier) employés par le moteur et l'interface, avec leur forme au « vous ». */
const IMPERATIVES: Record<string, string> = {
  absorbe: "absorbez",
  ajoute: "ajoutez",
  continue: "continuez",
  allonge: "allongez",
  coupe: "coupez",
  décale: "décalez",
  fais: "faites",
  garde: "gardez",
  laisse: "laissez",
  monte: "montez",
  ouvre: "ouvrez",
  pars: "partez",
  passe: "passez",
  place: "placez",
  ralentis: "ralentissez",
  pose: "posez",
  règle: "réglez",
  remplace: "remplacez",
  repasse: "repassez",
  reporte: "reportez",
  reste: "restez",
  tiens: "tenez",
  vise: "visez",
};

/** Expressions figées à convertir telles quelles (avant les règles mot à mot). */
const PHRASES: Array<[RegExp, string]> = [
  [/\btu dois\b/g, "vous devez"],
  [/\btu cours\b/g, "vous courez"],
  [/\btu courais\b/g, "vous couriez"],
  [/\btu tiens\b/g, "vous tenez"],
  [/\btu fais\b/g, "vous faites"],
  [/\btu as\b/g, "vous avez"],
  [/\btu es\b/g, "vous êtes"],
  [/\bTu dois\b/g, "Vous devez"],
  [/\btu peux\b/g, "vous pouvez"],
  [/\btu le dépasses\b/g, "vous le dépassez"],
  [/\bTu peux\b/g, "Vous pouvez"],
  [/\bt'a\b/g, "vous a"],
  [/\bt'est\b/g, "vous est"],
  [/\bt’a\b/g, "vous a"],
];

const WORDS: Record<string, string> = { ta: "votre", ton: "votre", tes: "vos", toi: "vous", tu: "vous" };

function matchCase(source: string, replacement: string): string {
  return source.charAt(0) === source.charAt(0).toUpperCase() && source.charAt(0) !== source.charAt(0).toLowerCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const WORD_PATTERN = new RegExp(`(?<![${LETTER}'’-])(ta|ton|tes|toi|tu|Ta|Ton|Tes|Toi|Tu)(?![${LETTER}'’])`, "g");
const IMPERATIVE_PATTERN = new RegExp(`(^\\s*|[:;.!?]\\s+|,\\s+|\\(\\s*)(${Object.keys(IMPERATIVES).map((verb) => `${verb}|${verb.charAt(0).toUpperCase()}${verb.slice(1)}`).join("|")})(?![${LETTER}'’-])`, "g");

/** Convertit une phrase du moteur (au « tu ») au vouvoiement. */
export function vouvoyer(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PHRASES) result = result.replace(pattern, replacement);
  result = result.replace(IMPERATIVE_PATTERN, (_match, before: string, verb: string) => `${before}${matchCase(verb, IMPERATIVES[verb.toLowerCase()])}`);
  result = result.replace(/-toi\b/g, "-vous");
  result = result.replace(WORD_PATTERN, (word: string) => matchCase(word, WORDS[word.toLowerCase()]));
  return result;
}

/** Applique `vouvoyer` à toutes les chaînes d'un objet produit par le moteur (suggestion, consignes, verdict). */
export function voiceDeep<T>(value: T, register: Register): T {
  if (register === "tu") return value;
  return mapStrings(value) as T;
}

function mapStrings(value: unknown): unknown {
  if (typeof value === "string") return vouvoyer(value);
  if (Array.isArray(value)) return value.map(mapStrings);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, mapStrings(entry)]));
  }
  return value;
}

/** Le moteur parle-t-il encore au « tu » ? (utilisé par les tests) */
export function hasTutoiement(text: string): boolean {
  WORD_PATTERN.lastIndex = 0;
  const pronoun = new RegExp(WORD_PATTERN.source).test(text);
  const imperative = new RegExp(IMPERATIVE_PATTERN.source).test(text);
  return pronoun || imperative || /\bt['’]a\b|-toi\b/.test(text);
}
