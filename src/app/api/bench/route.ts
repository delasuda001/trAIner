import { NextResponse } from "next/server";
import { budgetFromEnv } from "@/lib/bench/budget";
import { benchIsRunning, pendingTasks, runBench } from "@/lib/bench/runner";
import { logNightly } from "@/lib/bench/store";
import { apiAsAdmin } from "@/lib/profiles/request";

export const dynamic = "force-dynamic";

export function GET() {
  return apiAsAdmin(() => NextResponse.json({ running: benchIsRunning(), pending: pendingTasks().length }));
}

/** Lance le banc en arrière-plan, dans la limite des plafonds (lancement manuel, quand le quota est disponible). Réservé à Bastien. */
export function POST() {
  return apiAsAdmin(() => {
    if (benchIsRunning()) return NextResponse.json({ started: false, reason: "Un banc tourne déjà." });
    const startIso = new Date().toISOString();
    logNightly("début (bouton Paramètres)");
    // Lancé dans le contexte du profil administrateur : la tâche de fond en hérite.
    void runBench(budgetFromEnv(process.env), { nightStartIso: startIso })
      .then((summary) => logNightly(`banc : ${summary.done.length} tâche(s) faite(s), ${summary.remaining} restante(s)${summary.stoppedBecause ? `, arrêt : ${summary.stoppedBecause}` : ""}`))
      .catch((error: unknown) => logNightly(`banc en échec : ${error instanceof Error ? error.message : String(error)}`));
    return NextResponse.json({ started: true });
  });
}
