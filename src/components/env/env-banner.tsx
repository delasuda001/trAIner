import { FlaskConical } from "lucide-react";
import { isTestEnv } from "@/lib/env/environment";
import { readRelease, testDataCopiedAt } from "@/lib/env/release";

function when(iso: string | null): string {
  if (!iso) return "date inconnue";
  return new Date(iso).toLocaleString("fr-FR", { timeZone: "America/Toronto", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Bandeau toujours visible dans l'environnement de test : on ne confond jamais avec la prod des invités. */
export function EnvBanner({ signedIn }: { signedIn: boolean }) {
  if (!isTestEnv()) return null;
  const release = readRelease("test");
  return (
    <div className="env-banner" role="note">
      <FlaskConical size={14} aria-hidden />
      <span><strong>Environnement de test</strong> · données copiées le {when(testDataCopiedAt())}{release ? ` · version ${release.commit.slice(0, 7)}` : ""}</span>
      {/* Lien plein (pas de préchargement) : la bascule change d'adresse. */}
      {signedIn ? <a href="/api/env/switch" className="env-banner-link">Revenir à la prod</a> : null}
    </div>
  );
}
