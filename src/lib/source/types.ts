/**
 * Contrat de la source de données. Tout le reste de l'application ne connaît
 * que ces types : changer de source (Garmin, intervals.icu, import FIT…) ne
 * touche que l'adaptateur qui implémente `DataSource`.
 */

export type Sport = "running" | "trail_running" | "treadmill_running" | "cycling" | "swimming" | "hiking" | "walking" | "strength" | "ski_touring" | "surfing" | "other";

export type ActivitySummary = {
  /** Identifiant propre à la source (ex. activityId Garmin). */
  sourceId: string;
  name: string;
  sport: Sport;
  /** Type brut de la source, conservé pour affichage et débogage. */
  sourceType: string;
  startTimeUtc: string; // ISO 8601
  startTimeLocal: string; // "YYYY-MM-DDTHH:mm:ss" (heure locale de l'activité)
  distanceM: number | null;
  movingTimeS: number | null;
  elapsedTimeS: number | null;
  elevationGainM: number | null;
  averageSpeedMps: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  /** Pas par minute, les deux jambes (≈ 160-180 en course). */
  averageCadenceSpm: number | null;
  /** Charge d'entraînement de la source (Garmin : EPOC). */
  trainingLoad: number | null;
  aerobicTrainingEffect: number | null;
  anaerobicTrainingEffect: number | null;
  /** Bénéfice principal selon la montre (ex. "AEROBIC_BASE", "VO2MAX"). */
  trainingEffectLabel: string | null;
  /** Temps passé dans chaque zone FC, en secondes, zones 1 à 5. */
  hrTimeInZonesS: [number, number, number, number, number] | null;
  averageTemperatureC: number | null;
  lapCount: number | null;
};

export type Lap = {
  index: number;
  startOffsetS: number;
  durationS: number;
  distanceM: number | null;
  averageSpeedMps: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  elevationGainM: number | null;
  /** "manual", "distance", "time", "session_end"… */
  trigger: string | null;
};

/** Séries temporelles alignées, échantillonnées environ à 1 Hz. */
export type ActivityStreams = {
  /** Secondes écoulées depuis le départ (temps chrono, pauses exclues). */
  timeS: number[];
  distanceM: Array<number | null>;
  speedMps: Array<number | null>;
  heartRateBpm: Array<number | null>;
  cadenceSpm: Array<number | null>;
  altitudeM: Array<number | null>;
  /** Dynamique de course (montre ou capteur compatible), absente sur les appareils qui ne la mesurent pas. */
  groundContactMs?: Array<number | null>;
  verticalOscillationMm?: Array<number | null>;
  verticalRatioPct?: Array<number | null>;
  stepLengthMm?: Array<number | null>;
};

export type ActivityDetail = {
  streams: ActivityStreams | null;
  laps: Lap[];
};

export type WellnessDay = {
  date: string; // YYYY-MM-DD
  hrvLastNightMs: number | null;
  hrvWeeklyAvgMs: number | null;
  hrvBaselineLowMs: number | null;
  hrvBaselineHighMs: number | null;
  /** Statut fourni par la montre : BALANCED, UNBALANCED, LOW, POOR. */
  hrvStatus: string | null;
  sleepDurationS: number | null;
  sleepScore: number | null;
  restingHeartRateBpm: number | null;
  vo2max: number | null;
};

export type HeartRateZones = {
  /** Planchers des zones 1 à 5 (bpm), tels que configurés sur la montre. */
  floors: [number, number, number, number, number];
  maxHeartRateBpm: number | null;
  lactateThresholdHeartRateBpm: number | null;
  method: string | null;
};

export type AthleteProfile = {
  heartRateZones: HeartRateZones | null;
  /** Vitesse au seuil lactique mesurée par la montre (m/s). */
  lactateThresholdSpeedMps: number | null;
};

export type DataSource = {
  readonly name: string;
  /** Activités dont le départ est >= `since` (toutes si null), plus récentes d'abord. */
  listActivities(since: Date | null): Promise<ActivitySummary[]>;
  getActivityDetail(sourceId: string, sourceTypeHint?: string): Promise<ActivityDetail>;
  /** Jours de bien-être inclusifs entre deux dates YYYY-MM-DD. */
  getWellness(startDate: string, endDate: string): Promise<WellnessDay[]>;
  /** `latestRunSourceId` permet de lire le seuil mesuré lors de la dernière course. */
  getAthleteProfile(latestRunSourceId?: string): Promise<AthleteProfile>;
};

export class SourceError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly retryable = false) {
    super(message);
    this.name = "SourceError";
  }
}
