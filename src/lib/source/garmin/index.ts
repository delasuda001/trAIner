import { chunkDateRange } from "@/lib/dates";
import type { ActivityDetail, ActivitySummary, AthleteProfile, DataSource, WellnessDay } from "../types";
import { GarminClient } from "./client";
import { extractFirstZipEntry, parseFitActivity } from "./fit";
import { mapGarminActivity, mapGarminSport } from "./mapper";
import {
  garminActivityDetailSchema,
  garminActivityListItemSchema,
  garminActivityListSchema,
  garminDailySummariesSchema,
  garminHeartRateZonesSchema,
  garminHrvSchema,
  garminSleepSchema,
  garminVo2Schema,
} from "./schemas";

const PAGE_SIZE = 100;
/** Fenêtres maximales acceptées par l'API (constatées : 31 j pour le sommeil, ~90 j pour le reste). */
const WELLNESS_CHUNK_DAYS = 28;
const HRV_CHUNK_DAYS = 180;

const CADENCE_PER_LEG_SPORTS = new Set(["running", "trail_running", "treadmill_running", "hiking", "walking"]);

function emptyDay(date: string): WellnessDay {
  return { date, hrvLastNightMs: null, hrvWeeklyAvgMs: null, hrvBaselineLowMs: null, hrvBaselineHighMs: null, hrvStatus: null, sleepDurationS: null, sleepScore: null, restingHeartRateBpm: null, vo2max: null };
}

export class GarminSource implements DataSource {
  readonly name = "garmin";
  /** Type d'activité par identifiant, mémorisé au listage pour savoir si la cadence est par jambe. */
  private readonly typeById = new Map<string, string>();

  constructor(private readonly client: GarminClient) {}

  async listActivities(since: Date | null): Promise<ActivitySummary[]> {
    const results: ActivitySummary[] = [];
    const startDate = since ? since.toISOString().slice(0, 10) : null;
    for (let start = 0; ; start += PAGE_SIZE) {
      const params = new URLSearchParams({ start: String(start), limit: String(PAGE_SIZE) });
      if (startDate) params.set("startDate", startDate);
      const raw = garminActivityListSchema.parse((await this.client.getJson(`/activitylist-service/activities/search/activities?${params}`)) ?? []);
      for (const entry of raw) {
        const parsed = garminActivityListItemSchema.safeParse(entry);
        if (!parsed.success) continue;
        const activity = mapGarminActivity(parsed.data);
        this.typeById.set(activity.sourceId, parsed.data.activityType.typeKey);
        if (since && Date.parse(activity.startTimeUtc) < since.getTime()) continue;
        results.push(activity);
      }
      if (raw.length < PAGE_SIZE) break;
    }
    return results;
  }

  async getActivityDetail(sourceId: string, sourceType?: string): Promise<ActivityDetail> {
    if (!/^\d+$/.test(sourceId)) throw new Error("Identifiant d'activité Garmin invalide");
    const zip = await this.client.getBinary(`/download-service/files/activity/${sourceId}`);
    const type = sourceType ?? this.typeById.get(sourceId) ?? "running";
    return parseFitActivity(extractFirstZipEntry(zip), { cadenceIsPerLeg: CADENCE_PER_LEG_SPORTS.has(mapGarminSport(type)) });
  }

  async getWellness(startDate: string, endDate: string): Promise<WellnessDay[]> {
    const days = new Map<string, WellnessDay>();
    const day = (date: string) => {
      let value = days.get(date);
      if (!value) {
        value = emptyDay(date);
        days.set(date, value);
      }
      return value;
    };

    for (const [from, to] of chunkDateRange(startDate, endDate, HRV_CHUNK_DAYS)) {
      const hrv = garminHrvSchema.parse((await this.client.getJson(`/hrv-service/hrv/daily/${from}/${to}`)) ?? {});
      for (const entry of hrv.hrvSummaries) {
        const target = day(entry.calendarDate);
        target.hrvLastNightMs = entry.lastNightAvg ?? null;
        target.hrvWeeklyAvgMs = entry.weeklyAvg ?? null;
        target.hrvBaselineLowMs = entry.baseline?.balancedLow ?? null;
        target.hrvBaselineHighMs = entry.baseline?.balancedUpper ?? null;
        target.hrvStatus = entry.status ?? null;
      }
    }

    for (const [from, to] of chunkDateRange(startDate, endDate, WELLNESS_CHUNK_DAYS)) {
      const sleep = garminSleepSchema.parse((await this.client.getJson(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${from}&endDate=${to}`)) ?? []);
      for (const entry of sleep) {
        const target = day(entry.calendarDate);
        target.sleepDurationS = entry.sleepTimeSeconds != null && entry.sleepTimeSeconds > 0 ? entry.sleepTimeSeconds : null;
        target.sleepScore = entry.sleepScores?.overall?.value ?? null;
      }
      const daily = garminDailySummariesSchema.parse((await this.client.getJson(`/usersummary-service/v2/dailysummaries?startDate=${from}&endDate=${to}`)) ?? {});
      for (const entry of daily.data) {
        const resting = entry.heartRate?.restingValue;
        if (resting != null && resting > 0) day(entry.calendarDate).restingHeartRateBpm = resting;
      }
      const vo2 = garminVo2Schema.parse((await this.client.getJson(`/metrics-service/metrics/maxmet/daily/${from}/${to}`)) ?? []);
      for (const entry of vo2) {
        if (entry.generic) day(entry.generic.calendarDate).vo2max = entry.generic.vo2MaxPreciseValue ?? entry.generic.vo2MaxValue ?? null;
      }
    }

    return [...days.values()].filter((entry) => entry.date >= startDate && entry.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getAthleteProfile(latestRunSourceId?: string): Promise<AthleteProfile> {
    const zonesRaw = garminHeartRateZonesSchema.safeParse(await this.client.getJson("/biometric-service/heartRateZones/v2"));
    const zones = zonesRaw.success ? (zonesRaw.data.find((entry) => entry.sport === "RUNNING") ?? zonesRaw.data.find((entry) => entry.sport === "DEFAULT") ?? zonesRaw.data[0]) : undefined;
    let lactateThresholdSpeedMps: number | null = null;
    if (latestRunSourceId && /^\d+$/.test(latestRunSourceId)) {
      const detail = garminActivityDetailSchema.safeParse(await this.client.getJson(`/activity-service/activity/${latestRunSourceId}`));
      if (detail.success) lactateThresholdSpeedMps = detail.data.summaryDTO.lactateThresholdSpeed ?? null;
    }
    return {
      heartRateZones: zones
        ? {
            floors: [zones.zone1Floor, zones.zone2Floor, zones.zone3Floor, zones.zone4Floor, zones.zone5Floor],
            maxHeartRateBpm: zones.maxHeartRateUsed ?? null,
            lactateThresholdHeartRateBpm: zones.lactateThresholdHeartRateUsed ?? null,
            method: zones.trainingMethod ?? null,
          }
        : null,
      lactateThresholdSpeedMps,
    };
  }
}

const cachedSources = new Map<string, { apiKey: string; source: GarminSource }>();

/**
 * Source Garmin d'un profil. Chaque profil a sa propre clé, lue côté serveur
 * dans la variable d'environnement indiquée (`GARMIN_API_KEY` pour Bastien,
 * `GARMIN_API_KEY_<PROFIL>` pour un invité). La clé n'est jamais renvoyée.
 */
export function getGarminSource(envVar = "GARMIN_API_KEY"): GarminSource {
  const apiKey = process.env[envVar]?.trim();
  if (!apiKey) throw new Error(`${envVar} manquante dans .env.local (clé Garmin Connect Personal API).`);
  const hit = cachedSources.get(envVar);
  if (hit && hit.apiKey === apiKey) return hit.source;
  const source = new GarminSource(new GarminClient({ apiKey }));
  cachedSources.set(envVar, { apiKey, source });
  return source;
}

export type GarminKeyCheck = { present: boolean; valid: boolean | null; error: string | null };

/** Présence de la clé et, sur demande, validité (échange contre un jeton, sans lire de données). */
export async function checkGarminKey(envVar: string, verify: boolean): Promise<GarminKeyCheck> {
  const apiKey = process.env[envVar]?.trim();
  if (!apiKey) return { present: false, valid: null, error: null };
  if (!verify) return { present: true, valid: null, error: null };
  try {
    await new GarminClient({ apiKey }).verifyKey();
    return { present: true, valid: true, error: null };
  } catch (error) {
    return { present: true, valid: false, error: error instanceof Error ? error.message.slice(0, 200) : "Clé refusée" };
  }
}
