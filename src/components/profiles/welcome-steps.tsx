"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Explique l'ajout à l'écran d'accueil selon l'appareil (Safari iPhone, Chrome Android, ordinateur). */
export function InstallHint() {
  const [platform, setPlatform] = useState<"ios" | "android" | "other" | "installed">("other");
  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- détection unique de l'appareil après le rendu
    setPlatform(standalone ? "installed" : /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "other");
  }, []);
  if (platform === "installed") return <p className="small">C&apos;est fait : vous utilisez déjà l&apos;application depuis votre écran d&apos;accueil.</p>;
  if (platform === "ios") {
    return (
      <ol className="welcome-steps">
        <li>Ouvrez cette page dans <strong>Safari</strong> (depuis une autre application, touchez ⋯ puis « Ouvrir dans Safari »).</li>
        <li>Touchez le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut, en bas de l&apos;écran).</li>
        <li>Faites défiler et touchez <strong>« Sur l&apos;écran d&apos;accueil »</strong>, puis <strong>Ajouter</strong>.</li>
        <li>Ouvrez ensuite Sillage depuis la nouvelle icône : vous restez connecté.</li>
      </ol>
    );
  }
  if (platform === "android") {
    return (
      <ol className="welcome-steps">
        <li>Dans Chrome, touchez le menu <strong>⋮</strong> en haut à droite.</li>
        <li>Touchez <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong> (ou « Installer l&apos;application »).</li>
        <li>Ouvrez ensuite Sillage depuis la nouvelle icône.</li>
      </ol>
    );
  }
  return <p className="small">Sur un autre appareil (téléphone, ordinateur), ouvrez la même adresse et entrez votre prénom et votre code, une seule fois. Sur téléphone, ajoutez ensuite la page à l&apos;écran d&apos;accueil : Sillage s&apos;ouvrira comme une application.</p>;
}

export function WelcomeDone({ hasGoal }: { hasGoal: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function finish(target: string) {
    setBusy(true);
    await fetch("/api/onboarding", { method: "POST" });
    router.push(target);
    router.refresh();
  }
  return (
    <div className="welcome-actions">
      <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void finish("/")}>Voir mon tableau de bord</button>
      {!hasGoal ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void finish("/objectif")}>Ajouter un objectif (facultatif)</button> : null}
    </div>
  );
}

const STAGES: Array<{ stage: string; label: string }> = [
  { stage: "sync", label: "Lecture de vos séances Garmin" },
  { stage: "metrics", label: "Calcul de vos chiffres" },
  { stage: "coach", label: "Premiers commentaires du coach" },
];

/** Espace en cours de préparation : on montre l'avancement et la page se met à jour seule. */
export function PreparingNotice({ stage, activities }: { stage: string | null; activities: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [router]);
  const current = STAGES.findIndex((entry) => entry.stage === stage);
  return (
    <section className="card welcome-card">
      <h2 className="section-title">Bastien prépare votre espace</h2>
      <p className="small">Sillage lit vos 12 derniers mois Garmin et calcule tout pour vous. Cela prend quelques minutes, une seule fois ; cette page se met à jour toute seule.</p>
      <ol className="prepare-steps">
        {STAGES.map((entry, index) => (
          <li key={entry.stage} className={index < current ? "done" : index === current ? "current" : ""}>{entry.label}{index === 0 && activities ? ` · ${activities} activités` : ""}</li>
        ))}
      </ol>
    </section>
  );
}