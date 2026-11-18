import { z } from "zod";

/** Schémas Zod des réponses de la Garmin Connect Personal API (champs utilisés uniquement). */

const num = z.number().nullable().optional();
const str = z.string().nullable().optional();
/** Date du jour : Garmin renvoie parfois des jours sans date (null) ; ils sont ignorés à l'import. */
const calendarDate = z.string().nullable().optional();

export const garminActivityListItemSchema = z.object({
  activityId: z.number(),
  activityName: str,
  startTimeLocal: z.string(),
  startTimeGMT: z.string(),
  activityType: z.object({ typeKey: z.string() }).passthrough(),
  distance: num,
  duration: num,
  elapsedDuration: num,
  movingDuration: num,
  elevationGain: num,
  averageSpeed: num,
  averageHR: num,
  maxHR: num,
  averageRunningCadenceInStepsPerMinute: num,
  activityTrainingLoad: num,
  aerobicTrainingEffect: num,
  anaerobicTrainingEffect: num,
  trainingEffectLabel: str,
  hrTimeInZone_1: num,
  hrTimeInZone_2: num,
  hrTimeInZone_3: num,
  hrTimeInZone_4: num,
  hrTimeInZone_5: num,
  minTemperature: num,
  maxTemperature: num,
  lapCount: num,
}).passthrough();

export type GarminActivityListItem = z.infer<typeof garminActivityListItemSchema>;

export const garminActivityListSchema = z.array(z.unknown());

export const garminHrvSchema = z.object({
  hrvSummaries: z.array(z.object({
    calendarDate,
    weeklyAvg: num,
    lastNightAvg: num,
    status: str,
    baseline: z.object({ balancedLow: num, balancedUpper: num }).passthrough().nullable().optional(),
  }).passthrough()).default([]),
}).passthrough();

export const garminSleepSchema = z.array(z.object({
  calendarDate,
  sleepTimeSeconds: num,
  sleepScores: z.object({ overall: z.object({ value: num }).passthrough().nullable().optional() }).passthrough().nullable().optional(),
}).passthrough());

export const garminDailySummariesSchema = z.object({
  data: z.array(z.object({
    calendarDate,
    heartRate: z.object({ restingValue: num }).passthrough().nullable().optional(),
  }).passthrough()).default([]),
}).passthrough();

export const garminVo2Schema = z.array(z.object({
  generic: z.object({ calendarDate, vo2MaxPreciseValue: num, vo2MaxValue: num }).passthrough().nullable().optional(),
}).passthrough());

export const garminHeartRateZonesSchema = z.array(z.object({
  trainingMethod: str,
  sport: str,
  lactateThresholdHeartRateUsed: num,
  maxHeartRateUsed: num,
  zone1Floor: z.number(),
  zone2Floor: z.number(),
  zone3Floor: z.number(),
  zone4Floor: z.number(),
  zone5Floor: z.number(),
}).passthrough());

export const garminActivityDetailSchema = z.object({
  summaryDTO: z.object({ lactateThresholdSpeed: num, lactateThresholdHeartRate: num }).passthrough(),
}).passthrough();
