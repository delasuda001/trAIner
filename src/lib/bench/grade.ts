import type { SessionCoachOutput } from "@/lib/coach/session-coach";
import { allowedNumbers, collectText, extractNumberTokens, findUnsupportedNumbers, findZoneContradictions } from "@/lib/coach/number-guard";
import type { Prescription } from "@/lib/engine/prescription";

/**
 * Notation déterministe (gratuite) d'une analyse de séance : ce qu'on peut
 * vérifier sans juge LLM. Le juge Opus ne note ensuite que ce qui demande du
 * jugement (utilité de la comparaison, ton de coach).
 */

export type CheckKey = "chiffres_sources" | "zones" | "consigne_chiffree" | "consigne_moteur" | "pas_de_constat_dans_consigne" | "pas_de_doublon" | "concision";

export type Check = { key: CheckKey; label: string; pass: boolean; detail: string; weight: number };

export type DeterministicGrade = { checks: Check[]; score: number };

export const LENGTH_LIMITS = { verdict: 180, bullet: 200, keep: 160, shouldHave: 200, nextTime: 200, detail: 1200 } as const;

const TARGET_PATTERN = /\d:\d{2}\/km|\d{2,3}\s*bpm|\d:\d{2}\b|\d+\s*(?:min|s)\b/;
const OBSERVATION_WORDS = /cause probable|sans doute|probablement|s'explique|explique l'écart/i;

function numbers(text: string): Set<string> {
  return new Set(extractNumberTokens(text).filter((token) => token.includes(":") || Number(token.replace(",", ".")) > 12));
}

function paceBand(prescription: Prescription | null | undefined): string | null {
  if (!prescription || prescription.status !== "ok") return null;
  const match = prescription.next.cue.match(/\d:\d{2}–\d:\d{2}\/km/);
  return match ? match[0].replace("/km", "") : null;
}

export function gradeSessionOutput(input: { output: SessionCoachOutput; payload: unknown; zoneOf: (heartRate: number) => number; prescription: Prescription | null | undefined }): DeterministicGrade {
  const { output, payload, prescription } = input;
  const text = collectText(output);
  const unsupported = findUnsupportedNumbers(text, allowedNumbers(payload));
  const zones = findZoneContradictions(text, input.zoneOf);
  const hasPrescription = prescription?.status === "ok";
  const band = paceBand(prescription);
  const directives = `${output.shouldHave}\n${output.nextTime}`;

  const tooLong: string[] = [];
  if (output.verdict.length > LENGTH_LIMITS.verdict) tooLong.push(`verdict ${output.verdict.length}`);
  output.bullets.forEach((bullet, index) => { if (bullet.length > LENGTH_LIMITS.bullet) tooLong.push(`puce ${index + 1} ${bullet.length}`); });
  if (output.keep.length > LENGTH_LIMITS.keep) tooLong.push(`à reproduire ${output.keep.length}`);
  if (output.shouldHave.length > LENGTH_LIMITS.shouldHave) tooLong.push(`aurait dû ${output.shouldHave.length}`);
  if (output.nextTime.length > LENGTH_LIMITS.nextTime) tooLong.push(`prochaine fois ${output.nextTime.length}`);
  if (output.detail.length > LENGTH_LIMITS.detail) tooLong.push(`détail ${output.detail.length}`);

  const keepNumbers = numbers(output.keep);
  const shared = [...numbers(output.shouldHave)].filter((token) => keepNumbers.has(token));

  const checks: Check[] = [
    { key: "chiffres_sources", label: "Chiffres présents dans les données", pass: unsupported.length === 0, detail: unsupported.length ? `non sourcés : ${unsupported.join(", ")}` : "ok", weight: 3 },
    { key: "zones", label: "Zones FC cohérentes", pass: zones.length === 0, detail: zones.join(" ; ") || "ok", weight: 2 },
    {
      key: "consigne_chiffree",
      label: "Consignes chiffrées (aurait dû, prochaine fois)",
      pass: hasPrescription ? TARGET_PATTERN.test(output.shouldHave) && TARGET_PATTERN.test(output.nextTime) : true,
      detail: hasPrescription ? `aurait dû ${TARGET_PATTERN.test(output.shouldHave) ? "chiffré" : "sans cible"}, prochaine fois ${TARGET_PATTERN.test(output.nextTime) ? "chiffré" : "sans cible"}` : "pas de consigne attendue",
      weight: 3,
    },
    { key: "consigne_moteur", label: "Cible du moteur reprise", pass: band ? directives.includes(band) : true, detail: band ? (directives.includes(band) ? `${band} repris` : `${band} absent`) : "pas de fourchette d'allure", weight: 2 },
    { key: "pas_de_constat_dans_consigne", label: "Pas de constat dans les consignes", pass: !OBSERVATION_WORDS.test(directives), detail: OBSERVATION_WORDS.test(directives) ? `« ${directives.match(OBSERVATION_WORDS)?.[0]} »` : "ok", weight: 1 },
    { key: "pas_de_doublon", label: "« À reproduire » et « aurait dû » distincts", pass: shared.length < 2, detail: shared.length ? `chiffres communs : ${shared.join(", ")}` : "ok", weight: 1 },
    { key: "concision", label: "Longueurs respectées", pass: tooLong.length === 0, detail: tooLong.join(", ") || "ok", weight: 1 },
  ];
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = Math.round((checks.reduce((sum, check) => sum + (check.pass ? check.weight : 0), 0) / total) * 100);
  return { checks, score };
}
