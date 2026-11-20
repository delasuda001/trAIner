import "server-only";

import { addDays } from "@/lib/dates";
import { getRegistry, runAs, toMember } from "@/lib/profiles/context";
import { analyzeSession, getDashboard, loadContext } from "@/lib/server/analytics";
import { readOutlookCoach, readSessionCoach } from "@/lib/server/coach-service";
import { checkOutlook, checkSessionAnalysis, recordFindings } from "@/lib/server/quality-service";

/** Fenêtre revue par l'audit complet (bouton de Paramètres, script) : les 12 dernières semaines. */
export const AUDIT_DAYS = 84;

export type AuditSummary = { profiles: number; subjects: number; findings: number };

function storedOutput<T>(result: { status: string; output?: T; previous?: { output: T } }): T | null {
  return result.status === "ready" ? (result.output ?? null) : (result.previous?.output ?? null);
}

/**
 * Contrôle complet, sans aucun appel à Claude : pour chaque profil actif, chaque séance des
 * 12 dernières semaines (consignes du moteur et analyse de Claude stockée, même à mettre à jour)
 * et le conseil du jour. Les constats remplacent les précédents, sujet par sujet.
 */
export function runQualityAudit(days = AUDIT_DAYS): AuditSummary {
  const registry = getRegistry();
  const summary: AuditSummary = { profiles: 0, subjects: 0, findings: 0 };
  for (const record of registry.list().filter((entry) => entry.disabledAt == null)) {
    runAs(toMember(record), () => {
      const context = loadContext();
      if (!context.runs.length) return;
      summary.profiles += 1;
      const from = addDays(context.today, -days);
      for (const run of context.runs.filter((entry) => entry.localDate >= from)) {
        const analysis = analyzeSession(run.id, context);
        if (!analysis) continue;
        const findings = checkSessionAnalysis(analysis, context, storedOutput(readSessionCoach(analysis)), record.role);
        recordFindings("session", run.id, findings);
        summary.subjects += 1;
        summary.findings += findings.length;
      }
      const dashboard = getDashboard();
      const findings = checkOutlook(dashboard, context, storedOutput(readOutlookCoach(dashboard)), record.role);
      recordFindings("outlook", "current", findings);
      summary.subjects += 1;
      summary.findings += findings.length;
    });
  }
  return summary;
}
