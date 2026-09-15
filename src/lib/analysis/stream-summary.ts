import { z } from "zod";
import type { NormalizedStreams } from "@/lib/db/contracts";

/**
 * Version du format de résumé de streams. Sert de clé de cache
 * (`activity_stream_summaries.stream_version`) : la bump invalide les résumés
 * antérieurs, qui seront recalculés à la demande.
 */
export const STREAM_SUMMARY_VERSION = "1";

/**
 * Durées de référence pour les meilleurs efforts glissants (secondes).
 * Alignées sur `REFERENCE_DURATIONS_S` de `thresholds.ts`.
 */
export const REFERENCE_EFFORT_DURATIONS_S = [180, 300, 600, 1200, 1800] as const;

export const streamSummaryPayloadSchema = z
  .object({
    version: z.string(),
    computedAt: z.string(),
    sampleCount: z.number().int().nonnegative(),
    bestEfforts: z.array(
      z.object({
        durationS: z.number().int().positive(),
        actualElapsedS: z.number().positive(),
        distanceM: z.number().nonnegative(),
        speedMps: z.number().positive(),
        meanHeartRateBpm: z.number().positive().nullable(),
      })
    ),
  })
  .strict();

export type StreamSummaryPayload = z.infer<typeof streamSummaryPayloadSchema>;

/**
 * Calcule un résumé dérivé d'une activité à partir de ses streams normalisés :
 * pour chaque durée de référence, la fenêtre glissante couvrant le plus de
 * distance (donc l'effort le plus rapide) et la FC moyenne sur cette fenêtre.
 *
 * Seuls des agrégats sont produits (au plus 5 points + un compteur
 * d'échantillons). Aucune série brute, aucune donnée de localisation :
 * `NormalizedStreams` exclut déjà `latlng` en amont.
 */
export function computeStreamSummary(streams: NormalizedStreams): StreamSummaryPayload {
  const time = streams.elapsedTimeS;
  const distance = streams.distanceM;
  const heartRate = streams.heartRateBpm;

  const bestEfforts: StreamSummaryPayload["bestEfforts"] = [];

  const usableDistance = Array.isArray(distance) && distance.length === time.length;
  const totalElapsed = time.length > 0 ? time[time.length - 1] - time[0] : 0;

  if (usableDistance && time.length >= 2) {
    for (const durationS of REFERENCE_EFFORT_DURATIONS_S) {
      if (totalElapsed < durationS) continue;

      let best: { actualElapsedS: number; distanceM: number; speedMps: number; startIndex: number; endIndex: number } | null = null;
      let j = 0;
      for (let i = 0; i < time.length; i += 1) {
        if (j < i) j = i;
        while (j < time.length && time[j] - time[i] < durationS) j += 1;
        if (j >= time.length) break;

        const elapsed = time[j] - time[i];
        const covered = distance![j] - distance![i];
        if (elapsed <= 0 || covered <= 0) continue;

        const speed = covered / elapsed;
        if (!best || speed > best.speedMps) {
          best = { actualElapsedS: elapsed, distanceM: covered, speedMps: speed, startIndex: i, endIndex: j };
        }
      }

      if (best) {
        bestEfforts.push({
          durationS,
          actualElapsedS: Number(best.actualElapsedS.toFixed(1)),
          distanceM: Number(best.distanceM.toFixed(1)),
          speedMps: Number(best.speedMps.toFixed(4)),
          meanHeartRateBpm: meanHeartRate(heartRate, best.startIndex, best.endIndex),
        });
      }
    }
  }

  return streamSummaryPayloadSchema.parse({
    version: STREAM_SUMMARY_VERSION,
    computedAt: new Date().toISOString(),
    sampleCount: time.length,
    bestEfforts,
  });
}

function meanHeartRate(series: Array<number | null> | undefined, startIndex: number, endIndex: number): number | null {
  if (!Array.isArray(series)) return null;
  let sum = 0;
  let count = 0;
  for (let k = startIndex; k <= endIndex && k < series.length; k += 1) {
    const value = series[k];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      sum += value;
      count += 1;
    }
  }
  return count > 0 ? Number((sum / count).toFixed(1)) : null;
}
