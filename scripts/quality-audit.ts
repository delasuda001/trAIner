/**
 * Contrôle de cohérence de tous les profils, sans appel à Claude (voir lib/quality/coherence.ts) :
 *   npx tsx --conditions=react-server scripts/quality-audit.ts [--days=84] [--print]
 * Les constats sont enregistrés dans le registre (vue Paramètres) ; --print les affiche aussi.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const days = Number(process.argv.find((arg) => arg.startsWith("--days="))?.slice(7) ?? 84);
  const { adminMember, getRegistry, runAs } = await import("@/lib/profiles/context");
  const { runQualityAudit } = await import("@/lib/server/quality-audit");
  runAs(adminMember(), () => {
    const summary = runQualityAudit(days);
    console.log(`${summary.profiles} profil(s), ${summary.subjects} sujet(s), ${summary.findings} constat(s).`);
    if (process.argv.includes("--print")) {
      for (const finding of getRegistry().listQualityFindings()) console.log(`[${finding.severity}] ${finding.profileId} ${finding.subjectKind}:${finding.subjectId} · ${finding.code} · ${finding.where} · ${finding.message}`);
    }
  });
}

void main();
