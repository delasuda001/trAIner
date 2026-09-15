"use client";

import { useEffect, useState } from "react";
import type { PerformanceProfile } from "@/lib/llm/schemas";
import { selectConfidenceBannerState, isAlarmingBanner } from "@/lib/analysis/confidence-banner";

type RecalcResult = {
  windowWeeks: number;
  consideredActivities: number;
  computedSummaries: number;
  alreadyFresh: number;
  failed: number;
  rateLimited: boolean;
  retryAfter?: string;
  profile: PerformanceProfile;
};

const CONFIDENCE_LABEL: Record<PerformanceProfile["thresholdConfidence"], string> = {
  insufficient: "insuffisante",
  low: "faible",
  moderate: "modérée",
  good: "bonne",
};

const ZONE_LABEL: Record<"short" | "medium" | "long", string> = {
  short: "court (VO2max)",
  medium: "moyen (seuil)",
  long: "long (tempo)",
};

function formatEffortDuration(durationS: number): string {
  return durationS % 60 === 0 ? `${durationS / 60} min` : `${durationS} s`;
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function PerformanceProfilePanel() {
  const [profile, setProfile] = useState<PerformanceProfile>();
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetch("/api/performance-profile")
      .then((response) => (response.ok ? (response.json() as Promise<PerformanceProfile>) : Promise.reject(new Error("indisponible"))))
      .then(setProfile)
      .catch(() => setError("Le profil de performance n’a pas pu être chargé."))
      .finally(() => setLoading(false));
  }, []);

  async function recalculate() {
    setRecalculating(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const response = await fetch("/api/performance-profile/recalculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weeks: 12 }) });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error((payload as { error?: { message?: string } }).error?.message ?? "Le recalcul a échoué.");
      const result = payload as RecalcResult;
      setProfile(result.profile);
      setMessage(
        result.rateLimited
          ? `Recalcul interrompu (limite Intervals.icu). ${result.computedSummaries} résumé(s) ajouté(s), à relancer plus tard.`
          : `Profil recalculé : ${result.computedSummaries} résumé(s) ajouté(s), ${result.alreadyFresh} déjà à jour${result.failed > 0 ? `, ${result.failed} échec(s)` : ""}.`
      );
    } catch (recalcError) {
      setError(recalcError instanceof Error ? recalcError.message : "Le recalcul a échoué.");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <section className="panel laps-panel performance-profile">
      <div className="section-heading">
        <div>
          <p className="kicker">Calculé — lecture seule</p>
          <h2>Profil de performance</h2>
        </div>
        <button className="button" onClick={recalculate} disabled={recalculating || loading}>
          {recalculating ? "Recalcul en cours..." : "Recalculer mon profil"}
        </button>
      </div>
      <p className="data-note">
        Dérivé de vos activités synchronisées (meilleurs efforts, tendance de volume, débriefs récents). Distinct du contexte que vous déclarez ci-dessus, et jamais un score de charge ou de forme.
      </p>

      {loading && <div className="empty-row">Chargement du profil...</div>}
      {error && <p className="data-note error">{error}</p>}
      {message && <p className="data-note">{message}</p>}

      {profile && (
        <div className="profile-grid">
          <div className={`profile-block${isAlarmingBanner(selectConfidenceBannerState({ confidenceLevel: profile.thresholdConfidence, stalePointCount: profile.thresholdStalePointCount })) ? " state" : ""}`}>
            <h3>Allure seuil estimée</h3>
            <strong>{profile.thresholdPaceMinKm ? `${profile.thresholdPaceMinKm} /km` : "Non estimable"}</strong>
            <p className="data-note">Confiance : {CONFIDENCE_LABEL[profile.thresholdConfidence]}. Basée sur les efforts des {profile.estimateWindowWeeks} dernières semaines.</p>
            {/* Message de péremption : affiché dès qu'un point retenu a > 8 semaines, indépendamment de la confiance. */}
            {profile.thresholdStaleMessage && <p className="data-note">{profile.thresholdStaleMessage}</p>}
            {profile.thresholdBiasHint && <p className="data-note">{profile.thresholdBiasHint}</p>}
            {profile.missingDurationZones.length > 0 && (
              <p className="data-note">Durées non couvertes : {profile.missingDurationZones.map((zone) => ZONE_LABEL[zone]).join(", ")}.</p>
            )}
          </div>

          <div className="profile-block">
            <h3>Meilleurs efforts</h3>
            {profile.bestEfforts.length === 0 ? (
              <p className="data-note">Aucun résumé de courbes en cache. Ouvrez l’onglet Courbes d’une activité ou recalculez.</p>
            ) : (
              <>
                <ul>
                  {profile.bestEfforts.map((effort) => (
                    <li key={effort.durationS} className={effort.status === "rejected" ? "effort-rejected" : undefined}>
                      <span className="effort-badge">{effort.status === "rejected" ? "écarté" : "utilisé"}</span>
                      {formatEffortDuration(effort.durationS)} : {effort.paceMinKm} /km
                      {effort.meanHeartRateBpm != null ? ` — FC ~${Math.round(effort.meanHeartRateBpm)} bpm` : ""}
                      {effort.activityDate ? ` (${formatShortDate(effort.activityDate)})` : ""}
                      {effort.status === "rejected" && effort.rejectionReason ? <span className="data-note effort-reason">{effort.rejectionReason}</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="data-note">« Écarté » = non retenu par l’estimation de seuil (filtre d’intensité ou de plausibilité) — l’effort reste affiché avec son motif.</p>
              </>
            )}
          </div>

          <div className="profile-block">
            <h3>Volume de course</h3>
            {profile.weeklyVolume.recentAverageKm == null ? (
              <p className="data-note">Pas assez d’activités sur 12 semaines.</p>
            ) : (
              <>
                <strong>{profile.weeklyVolume.recentAverageKm} km/sem (4 dernières semaines)</strong>
                {profile.weeklyVolume.trend && <p className="data-note">{profile.weeklyVolume.trend}.</p>}
              </>
            )}
          </div>

          <div className="profile-block">
            <h3>Points clés des débriefs récents</h3>
            {profile.recentKeyTakeaways.length === 0 ? (
              <p className="data-note">Aucun débrief exploitable.</p>
            ) : (
              <ul>
                {profile.recentKeyTakeaways.map((takeaway, index) => (
                  <li key={`takeaway-${index}`}>{takeaway}</li>
                ))}
              </ul>
            )}
          </div>

          <p className="data-note">
            {profile.activitiesWithStreamSummaryInWindow} activité(s) avec résumé de courbes dans la fenêtre ({profile.activitiesWithStreamSummary} au total sur {profile.totalRunningActivities} course(s) synchronisée(s)).
          </p>
        </div>
      )}
    </section>
  );
}
