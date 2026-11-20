"use client";

import { useEffect } from "react";

const KEY = "sillage:settings-groups";

function read(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
    }
  } catch {
    // Stockage indisponible (navigation privée) : on garde l'état par défaut.
  }
  return {};
}

/**
 * Retient, sur cet appareil, les catégories ouvertes ou repliées de la page Paramètres.
 * Sans choix retenu, la page garde ses défauts (certaines catégories longues repliées sur téléphone).
 */
export function GroupMemory({ scope }: { scope: string }) {
  useEffect(() => {
    const groups = Array.from(document.querySelectorAll<HTMLDetailsElement>("details.settings-group[id]"));
    const saved = read();
    const phone = window.matchMedia("(max-width: 820px)").matches;
    for (const group of groups) {
      const value = saved[`${scope}:${group.id}`];
      if (value !== undefined) group.open = value;
      else if (phone && group.hasAttribute("data-closed-on-phone")) group.open = false;
    }
    function remember(event: Event) {
      const group = event.currentTarget as HTMLDetailsElement;
      const next = { ...read(), [`${scope}:${group.id}`]: group.open };
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* rien à retenir */ }
    }
    for (const group of groups) group.addEventListener("toggle", remember);
    return () => { for (const group of groups) group.removeEventListener("toggle", remember); };
  }, [scope]);
  return null;
}
