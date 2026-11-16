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
  if (platform === "installed") return <p className="small">C&apos;est fait : tu utilises déjà l&apos;application depuis ton écran d&apos;accueil.</p>;
  if (platform === "ios") {
    return (
      <ol className="welcome-steps">
        <li>Ouvre cette page dans <strong>Safari</strong> (si tu es dans une autre application, touche ⋯ puis « Ouvrir dans Safari »).</li>
        <li>Touche le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut, en bas de l&apos;écran).</li>
        <li>Fais défiler et touche <strong>« Sur l&apos;écran d&apos;accueil »</strong>, puis <strong>Ajouter</strong>.</li>
        <li>Ouvre ensuite Sillage depuis la nouvelle icône : tu restes connecté.</li>
      </ol>
    );
  }
  if (platform === "android") {
    return (
      <ol className="welcome-steps">
        <li>Dans Chrome, touche le menu <strong>⋮</strong> en haut à droite.</li>
        <li>Touche <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong> (ou « Installer l&apos;application »).</li>
        <li>Ouvre ensuite Sillage depuis la nouvelle icône.</li>
      </ol>
    );
  }
  return <p className="small">Sur téléphone, ouvre ce même lien et ajoute la page à l&apos;écran d&apos;accueil : Sillage s&apos;ouvrira comme une application.</p>;
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
    <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void finish(hasGoal ? "/" : "/objectif")}>{hasGoal ? "C'est parti" : "Renseigner mon objectif"}</button>
      {!hasGoal ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void finish("/")}>Plus tard</button> : null}
    </div>
  );
}
