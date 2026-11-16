import { inflateRawSync } from "node:zlib";
import { Decoder, Stream } from "@garmin/fitsdk";
import type { ActivityDetail, ActivityStreams, Lap } from "../types";

/** Extrait le premier fichier d'une archive ZIP (Garmin livre un seul .fit par archive). */
export function extractFirstZipEntry(zip: Buffer): Buffer {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOfCentralDirectory = zip.lastIndexOf(signature);
  if (endOfCentralDirectory < 0) throw new Error("Archive ZIP invalide");
  const centralOffset = zip.readUInt32LE(endOfCentralDirectory + 16);
  const method = zip.readUInt16LE(centralOffset + 10);
  const compressedSize = zip.readUInt32LE(centralOffset + 20);
  const localHeaderOffset = zip.readUInt32LE(centralOffset + 42);
  const nameLength = zip.readUInt16LE(localHeaderOffset + 26);
  const extraLength = zip.readUInt16LE(localHeaderOffset + 28);
  const start = localHeaderOffset + 30 + nameLength + extraLength;
  const data = zip.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Méthode de compression ZIP non gérée : ${method}`);
}

type FitRecord = {
  timestamp?: Date;
  distance?: number;
  enhancedSpeed?: number;
  speed?: number;
  heartRate?: number;
  cadence?: number;
  fractionalCadence?: number;
  enhancedAltitude?: number;
  altitude?: number;
};

type FitLap = {
  totalTimerTime?: number;
  totalElapsedTime?: number;
  totalDistance?: number;
  enhancedAvgSpeed?: number;
  avgSpeed?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;
  avgFractionalCadence?: number;
  totalAscent?: number;
  lapTrigger?: string;
};

/** Écart au-delà duquel deux échantillons sont séparés par une pause. */
const PAUSE_GAP_S = 10;
const MAX_SAMPLES = 20_000;

function round(value: number | undefined | null, digits: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Les montres Garmin enregistrent la cadence de course par jambe : on la double. */
function stepsPerMinute(cadence: number | undefined, fractional: number | undefined, doubled: boolean): number | null {
  if (cadence == null || cadence <= 0) return null;
  const value = cadence + (fractional ?? 0);
  return round(doubled ? value * 2 : value, 1);
}

export function parseFitActivity(fit: Buffer, options: { cadenceIsPerLeg: boolean }): ActivityDetail {
  const decoder = new Decoder(Stream.fromBuffer(fit));
  if (!decoder.isFIT()) throw new Error("Fichier FIT invalide");
  const { messages } = decoder.read({ convertDateTimesToDates: true, applyScaleAndOffset: true, expandComponents: true, convertTypesToStrings: true, mergeHeartRates: true });
  const records = ((messages.recordMesgs ?? []) as FitRecord[]).filter((record) => record.timestamp instanceof Date);
  const laps = ((messages.lapMesgs ?? []) as FitLap[]);
  return { streams: buildStreams(records, options.cadenceIsPerLeg), laps: buildLaps(laps, options.cadenceIsPerLeg) };
}

function buildStreams(records: FitRecord[], cadenceIsPerLeg: boolean): ActivityStreams | null {
  if (records.length < 2) return null;
  const stride = Math.max(1, Math.ceil(records.length / MAX_SAMPLES));
  const streams: ActivityStreams = { timeS: [], distanceM: [], speedMps: [], heartRateBpm: [], cadenceSpm: [], altitudeM: [] };
  let clock = 0;
  let previous: number | null = null;
  records.forEach((record, index) => {
    const timestamp = (record.timestamp as Date).getTime() / 1000;
    if (previous != null) {
      const gap = timestamp - previous;
      clock += gap > PAUSE_GAP_S ? 1 : Math.max(0, gap);
    }
    previous = timestamp;
    if (index % stride !== 0) return;
    streams.timeS.push(Math.round(clock));
    streams.distanceM.push(round(record.distance, 1));
    streams.speedMps.push(round(record.enhancedSpeed ?? record.speed, 3));
    streams.heartRateBpm.push(record.heartRate != null && record.heartRate > 0 ? record.heartRate : null);
    streams.cadenceSpm.push(stepsPerMinute(record.cadence, record.fractionalCadence, cadenceIsPerLeg));
    streams.altitudeM.push(round(record.enhancedAltitude ?? record.altitude, 1));
  });
  return streams;
}

function buildLaps(laps: FitLap[], cadenceIsPerLeg: boolean): Lap[] {
  let offset = 0;
  return laps.map((lap, index) => {
    const duration = lap.totalTimerTime ?? lap.totalElapsedTime ?? 0;
    const result: Lap = {
      index,
      startOffsetS: Math.round(offset),
      durationS: Math.round(duration),
      distanceM: round(lap.totalDistance, 1),
      averageSpeedMps: round(lap.enhancedAvgSpeed ?? lap.avgSpeed, 3),
      averageHeartRateBpm: lap.avgHeartRate ?? null,
      maxHeartRateBpm: lap.maxHeartRate ?? null,
      averageCadenceSpm: stepsPerMinute(lap.avgCadence, lap.avgFractionalCadence, cadenceIsPerLeg),
      elevationGainM: lap.totalAscent ?? null,
      trigger: lap.lapTrigger ?? null,
    };
    offset += duration;
    return result;
  });
}
