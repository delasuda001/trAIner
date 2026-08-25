import { streamsSchema } from "./schemas";
import { IntervalsApiError, IntervalsValidationError } from "./client";

const API_URL = "https://intervals.icu/api/v1";
export type StreamRequestContext = { requestId: string; activityId: string };

export async function fetchActivityStreams(id: string, context: StreamRequestContext): Promise<unknown> {
  const apiKey = process.env.INTERVALS_API_KEY;
  if (!apiKey) throw new Error("Configuration Intervals.icu incomplète");
  const endpoint = `/activity/${encodeURIComponent(id)}/streams`;
  console.info("[intervals] streams request", { requestId: context.requestId, activityId: id, endpoint });
  let response: Response;
  try { response = await fetch(`${API_URL}${endpoint}`, { headers: { Authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}` }, next: { revalidate: 86400 } }); }
  catch { throw new IntervalsApiError(503, "Service Intervals.icu indisponible", endpoint); }
  console.info("[intervals] streams response", { requestId: context.requestId, activityId: id, endpoint, status: response.status });
  if (!response.ok) throw new IntervalsApiError(response.status, "Erreur de réponse Intervals.icu", endpoint, response.headers.get("retry-after") ?? undefined);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new IntervalsValidationError(endpoint, ["invalid_json"]); }
  try { return streamsSchema.parse(payload); } catch { throw new IntervalsValidationError(endpoint, ["invalid_streams"]); }
}