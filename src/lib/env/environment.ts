/**
 * Deux environnements sur le Mac de Bastien :
 * - prod : ce que voient les invités (port 3000, adresse publique), mis à jour par promotion ;
 * - test : à Bastien seul (port 3100, adresse publique sur le port 8443), copie des données, nouvelles versions.
 * Le même code tourne dans les deux ; `SILLAGE_ENV=test` (au build et au lancement) choisit le test.
 * Module pur (aussi lu par le proxy) : ni base, ni `server-only`.
 */

export type SillageEnv = "prod" | "test";

export function sillageEnv(): SillageEnv {
  return process.env.SILLAGE_ENV === "test" ? "test" : "prod";
}

export function isTestEnv(): boolean {
  return sillageEnv() === "test";
}

/** Cookie propre à chaque environnement : même hôte, ports différents, les cookies ne sont pas isolés par port. */
export function sessionCookieName(env: SillageEnv = sillageEnv()): string {
  return env === "test" ? "sillage_test_session" : "sillage_session";
}

export const ENV_PORTS = { prod: { local: 3000, public: 443 }, test: { local: 3100, public: 8443 } } as const;

/**
 * Adresse de l'autre environnement, vue depuis l'hôte de la requête : sur le Mac (127.0.0.1, localhost) on
 * reste en local, sinon on garde l'adresse publique en changeant seulement le port (Funnel : 443 prod, 8443 test).
 */
export function otherEnvOrigin(host: string, target: SillageEnv): string {
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const local = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  if (local) return `http://${hostname === "::1" ? "127.0.0.1" : hostname}:${ENV_PORTS[target].local}`;
  const port = ENV_PORTS[target].public;
  return `https://${hostname}${port === 443 ? "" : `:${port}`}`;
}
