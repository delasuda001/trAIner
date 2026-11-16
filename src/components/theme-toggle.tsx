"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABELS: Record<Theme, string> = { system: "Thème : système", light: "Thème : clair", dark: "Thème : sombre" };

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique de la préférence locale au montage
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {}
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem("theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("theme", next);
        document.documentElement.dataset.theme = next;
      }
    } catch {}
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button type="button" className="btn btn-ghost icon-btn" onClick={cycle} title={LABELS[theme]} aria-label={LABELS[theme]}>
      <Icon size={16} />
    </button>
  );
}
