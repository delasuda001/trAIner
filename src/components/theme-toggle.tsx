"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/** Sombre par défaut ; le choix clair est mémorisé dans le navigateur. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du thème appliqué avant le rendu
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      if (next === "light") {
        localStorage.setItem("theme", "light");
        document.documentElement.dataset.theme = "light";
      } else {
        localStorage.removeItem("theme");
        delete document.documentElement.dataset.theme;
      }
    } catch {}
  }

  const label = theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
  return (
    <button type="button" className="btn btn-ghost icon-btn" onClick={toggle} title={label} aria-label={label}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
