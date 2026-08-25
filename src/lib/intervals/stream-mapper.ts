import { normalizedStreamsSchema, type NormalizedStreams } from "@/lib/db/contracts";

type RawStream = { type: string; data?: unknown[] };
const allowedTypes = new Set(["time", "distance", "velocity_smooth", "heartrate", "cadence", "altitude", "watts", "power"]);

export function normalizeActivityStreams(activityId: string, payload: unknown): NormalizedStreams {
  if (!Array.isArray(payload)) throw new Error("Réponse streams invalide");
  const streams = payload as RawStream[];
  const time = numericSeries(find(streams, "time")?.data);
  if (!time || time.length === 0) throw new Error("Série temporelle absente");
  const warnings: string[] = [];
  const distance = numericSeries(find(streams, "distance")?.data);
  const speed = nullableSeries(find(streams, "velocity_smooth")?.data);
  const heartRate = nullableSeries(find(streams, "heartrate")?.data);
  const cadence = nullableSeries(find(streams, "cadence")?.data);
  const altitude = nullableSeries(find(streams, "altitude")?.data);
  const power = nullableSeries(find(streams, "watts")?.data) ?? nullableSeries(find(streams, "power")?.data);
  const series = { distanceM: distance, speedMps: speed, heartRateBpm: heartRate, cadenceSpm: cadence, altitudeM: altitude, powerW: power };
  for (const [name, values] of Object.entries(series)) if (values && values.length !== time.length) { warnings.push(`Série ${name} ignorée : longueur incohérente`); delete series[name as keyof typeof series]; }
  const result = { activityId, sampleCount: time.length, elapsedTimeS: time, ...series, availability: { speed: Boolean(series.speedMps), heartRate: Boolean(series.heartRateBpm), cadence: Boolean(series.cadenceSpm), altitude: Boolean(series.altitudeM), power: Boolean(series.powerW) }, qualityWarnings: warnings };
  return normalizedStreamsSchema.parse(result);
}

function find(streams: RawStream[], type: string): RawStream | undefined { return streams.find((stream) => stream.type === type); }
function numericSeries(data?: unknown[]): number[] | undefined { return data && data.every((value) => typeof value === "number" && Number.isFinite(value)) ? data as number[] : undefined; }
function nullableSeries(data?: unknown[]): Array<number | null> | undefined { return data && data.every((value) => value === null || (typeof value === "number" && Number.isFinite(value))) ? data as Array<number | null> : undefined; }
export function isAllowedStreamType(type: string): boolean { return allowedTypes.has(type); }