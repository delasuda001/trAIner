import { SourceError } from "../types";

/**
 * Client HTTP minimal de la Garmin Connect Personal API.
 * La clé personnelle (GARMIN_API_KEY) est échangée contre un jeton d'accès
 * valable 24 h, conservé en mémoire du processus serveur uniquement.
 * Ni la clé ni le jeton ne sont jamais journalisés ni renvoyés au navigateur.
 */

export const GARMIN_BASE_URL = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
/** Marge de sécurité : on renouvelle le jeton avant ses 24 h. */
const TOKEN_LIFETIME_MS = 20 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 4;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type CachedToken = { value: string; expiresAt: number };

export type GarminClientOptions = {
  apiKey: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

function parseToken(body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const token = parsed.access_token ?? parsed.accessToken ?? parsed.token;
    if (typeof token === "string" && token.length > 0) return token;
    throw new SourceError("Réponse de jeton Garmin inattendue");
  }
  const token = trimmed.replace(/^"|"$/g, "");
  if (!token) throw new SourceError("Jeton Garmin vide");
  return token;
}

export class GarminClient {
  private token: CachedToken | null = null;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: GarminClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  private async getToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > this.now()) return this.token.value;
    const response = await this.fetchImpl(`${GARMIN_BASE_URL}${TOKEN_PATH}`, {
      method: "POST",
      headers: { Authorization: `ApiKey ${this.options.apiKey}`, Accept: "*/*" },
      cache: "no-store",
    });
    if (!response.ok) {
      const hint = response.status === 401 || response.status === 403 ? " La clé Garmin Personal API est peut-être expirée ou supprimée." : "";
      throw new SourceError(`Garmin a refusé la clé personnelle (HTTP ${response.status}).${hint}`, response.status, false);
    }
    const value = parseToken(await response.text());
    this.token = { value, expiresAt: this.now() + TOKEN_LIFETIME_MS };
    return value;
  }

  private async request(path: string, accept: string): Promise<Response> {
    let refreshed = false;
    for (let attempt = 1; ; attempt += 1) {
      const token = await this.getToken();
      let response: Response;
      try {
        response = await this.fetchImpl(`${GARMIN_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: accept }, cache: "no-store" });
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw new SourceError(`Garmin injoignable : ${(error as Error).message}`, null, true);
        await this.sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        await this.getToken(true);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** (attempt - 1));
        continue;
      }
      return response;
    }
  }

  /** GET JSON. Renvoie `null` pour une absence de données (404 ou corps vide). */
  async getJson(path: string): Promise<unknown> {
    const response = await this.request(path, "application/json");
    if (response.status === 404) return null;
    if (!response.ok) throw new SourceError(`Garmin a répondu HTTP ${response.status} sur ${path.split("?")[0]}`, response.status, response.status === 429 || response.status >= 500);
    const text = await response.text();
    return text.trim() ? (JSON.parse(text) as unknown) : null;
  }

  async getBinary(path: string): Promise<Buffer> {
    const response = await this.request(path, "application/zip, application/x-zip-compressed, application/octet-stream");
    if (!response.ok) throw new SourceError(`Garmin a répondu HTTP ${response.status} sur ${path.split("?")[0]}`, response.status, response.status === 429 || response.status >= 500);
    return Buffer.from(await response.arrayBuffer());
  }
}
