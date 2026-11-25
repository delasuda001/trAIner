import { ArrowRightLeft, FlaskConical, Radio } from "lucide-react";
import { isTestEnv } from "@/lib/env/environment";
import { readRelease, testDataCopiedAt, type Release } from "@/lib/env/release";

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { timeZone: "America/Toronto", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function describe(release: Release | null): string {
  return release ? `${release.commit.slice(0, 7)}${release.subject ? ` · ${release.subject.slice(0, 70)}` : ""} (build du ${when(release.builtAt)})` : "version non relevée";
}

/** Carte de Bastien (Paramètres) : où il est, les deux versions, et la bascule en un toucher. */
export function EnvSwitchCard() {
  const test = isTestEnv();
  return (
    <section className={`card env-card${test ? " is-test" : ""}`}>
      <div className="row-between" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 className="section-title">{test ? <><FlaskConical size={15} /> Tu es dans l&apos;environnement de test</> : <><Radio size={15} /> Tu es en prod (ce que voient les invités)</>}</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Prod : {describe(readRelease("prod"))}<br />
            Test : {describe(readRelease("test"))} · données copiées le {when(testDataCopiedAt())}
          </p>
        </div>
        <a className="btn btn-primary" href="/api/env/switch"><ArrowRightLeft size={14} /> {test ? "Revenir à la prod" : "Ouvrir le test"}</a>
      </div>
      <p className="small muted" style={{ margin: "8px 0 0" }}>Le test est à toi seul : une copie des données (les invités n&apos;y entrent pas, rien n&apos;y touche leurs vraies données), le coach y appelle Claude sur ton abonnement. Les nouveautés y arrivent d&apos;abord, puis passent en prod une fois vérifiées.</p>
    </section>
  );
}
