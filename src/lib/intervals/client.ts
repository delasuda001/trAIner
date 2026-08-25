import "server-only";

import { activitiesSchema, activitySchema, intervalsSchema } from "./schemas";
import type { Activity, Lap } from "./schemas";

const API_URL = "https://intervals.icu/api/v1";

export type ActivityRequestContext = { requestId: string; activityId: string };

export class IntervalsApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly endpoint: string) {
    super(message);
    this.name = "IntervalsApiError";
  }
}

export class IntervalsValidationError extends Error {
  constructor(public readonly endpoint: string, public readonly receivedKeys: string[]) {
    super("Réponse Intervals.icu non conforme");
    this.name = "IntervalsValidationError";
  }
}

function credentials(): string {
  const apiKey = process.env.INTERVALS_API_KEY;
  const athleteId = process.env.INTERVALS_ATHLETE_ID;
  if (!apiKey || !athleteId) {
    throw new Error("Configuration Intervals.icu incomplète");
  }
  return Buffer.from(`API_KEY:${apiKey}`).toString("base64");
}

async function intervalsFetch(path: string, context: ActivityRequestContext): Promise<unknown> {
  const endpoint = `${API_URL}${path}`;
  console.info("[intervals] request", { requestId: context.requestId, activityId: context.activityId, endpoint: path });
  let response: Response;
  try {
    response = await fetch(endpoint, {
    headers: { Authorization: `Basic ${credentials()}` },
    next: { revalidate: 60 },
    });
  } catch {
    console.error("[intervals] network error", { requestId: context.requestId, activityId: context.activityId, endpoint: path });
    throw new IntervalsApiError(503, "Service Intervals.icu indisponible", path);
  }
  console.info("[intervals] response", { requestId: context.requestId, activityId: context.activityId, endpoint: path, status: response.status });
  if (!response.ok) throw new IntervalsApiError(response.status, "Erreur de réponse Intervals.icu", path);
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new IntervalsValidationError(path, ["invalid_json"]); }
  console.info("[intervals] payload keys", { requestId: context.requestId, activityId: context.activityId, endpoint: path, keys: Array.isArray(payload) ? ["array"] : typeof payload === "object" && payload !== null ? Object.keys(payload).slice(0, 20) : [typeof payload] });
  return payload;
}

export async function listRecentActivities(): Promise<Activity[]> {
  const athleteId = process.env.INTERVALS_ATHLETE_ID;
  if (!athleteId) throw new Error("Configuration Intervals.icu incomplète");
  const newest = new Date().toISOString().slice(0, 10);
  const oldest = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const payload = await intervalsFetch(`/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`, { requestId: "list", activityId: "list" });
  return activitiesSchema.parse(payload).filter((activity) => activity.type.toLowerCase() === "run");
}

export async function getActivity(id: string, requestId: string): Promise<{ activity: Activity; laps: Lap[] }> {
  const context = { requestId, activityId: id };
  const activityPath = `/activity/${encodeURIComponent(id)}`;
  const activityPayload = await intervalsFetch(activityPath, context);
  let activity: Activity;
  try { activity = activitySchema.parse(activityPayload); }
  catch { throw new IntervalsValidationError(activityPath, objectKeys(activityPayload)); }
  const lapsPath = `/activity/${encodeURIComponent(id)}/intervals`;
  try {
    const intervalsPayload = await intervalsFetch(lapsPath, context);
    try {
      const intervals = intervalsSchema.parse(intervalsPayload);
      return { activity, laps: intervals.icu_intervals.map((interval) => ({
        id: interval.id,
        name: interval.label ?? interval.type ?? null,
        distance: interval.distance,
        elapsed_time: interval.elapsed_time,
        moving_time: interval.moving_time,
        average_speed: interval.average_speed,
        average_heartrate: interval.average_heartrate,
        average_cadence: interval.average_cadence,
      })) };
    }
    catch { throw new IntervalsValidationError(lapsPath, objectKeys(intervalsPayload)); }
  } catch (error) {
    if (error instanceof IntervalsApiError && error.status === 404) return { activity, laps: [] };
    throw error;
  }
}

function objectKeys(payload: unknown): string[] {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? Object.keys(payload).slice(0, 20) : [Array.isArray(payload) ? "array" : typeof payload];
}