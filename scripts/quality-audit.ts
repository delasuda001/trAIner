/**
 * Contrôle qualité des analyses, tous profils.
 *   npx tsx --conditions=react-server scripts/quality-audit.ts [--days=84] [--print]
 *     contrôle de cohérence en code, sans appel à Claude (voir lib/quality/coherence.ts) ;
 *   … --review [--scheduled]
 *     en plus, relecture IA indépendante par lots (Haiku, plafonds du banc). Avec --scheduled,
 *     seulement entre 21 h et 5 h (quota de Bastien libre).
 * Les constats sont enregistrés dans le registre (vue Paramètres) ; --print les affiche aussi.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const days = Number(process.argv.find((arg) => arg.startsWith("--days="))?.slice(7) ?? 84);
  const { adminMember, getRegistry, runAs } = await import("@/lib/profiles/context");
  const { runQualityAudit } = await import("@/lib/server/quality-audit");
  const { runQualityReview } = await import("@/lib/server/quality-review-service");
  await runAs(adminMember(), async () => {
    const summary = runQualityAudit(days);
    console.log(`Règles : ${summary.profiles} profil(s), ${summary.subjects} sujet(s), ${summary.findings} constat(s).`);
    if (process.argv.includes("--review")) {
      const hour = new Date().getHours();
      if (process.argv.includes("--scheduled") && hour >= 5 && hour < 21) {
        console.log("Relecture IA : hors fenêtre 21 h – 5 h, reportée.");
      } else {
        const review = await runQualityReview();
        console.log(`Relecture IA : ${review.profiles} profil(s), ${review.cases} cas, ${review.findings} constat(s)${review.stoppedBecause ? `, arrêt : ${review.stoppedBecause}` : ""}.`);
      }
    }
    if (process.argv.includes("--print")) {
      for (const finding of getRegistry().listQualityFindings()) console.log(`[${finding.severity}] ${finding.source} ${finding.profileId} ${finding.subjectKind}:${finding.subjectId} · ${finding.code} · ${finding.where} · ${finding.message}`);
    }
  });
}

void main();
