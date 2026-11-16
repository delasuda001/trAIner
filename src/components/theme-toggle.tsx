"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Thème du système par défaut ; un clic force l'autre et le mémorise dans le navigateur. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const explicit = document.documentElement.dataset.theme;
    const effective: Theme = explicit === "dark" || explicit === "light" ? explicit : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du thème appliqué avant le rendu
    setTheme(effective);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  const label = theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
  return (
    <button type="button" className="btn btn-ghost icon-btn" onClick={toggle} title={label} aria-label={label}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
