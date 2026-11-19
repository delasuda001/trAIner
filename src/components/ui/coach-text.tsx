"use client";

import { emphasize } from "@/lib/coach/emphasis";
import { useSay } from "./register";

/**
 * Texte du coach avec sa consigne clé surlignée (au plus deux segments : séance, durée,
 * allure, FC, zone). Le texte n'est pas modifié ; seule la mise en forme change.
 * `voice` : phrase du moteur écrite au « tu », vouvoyée pour un invité.
 */
export function CoachText({ text, voice = false }: { text: string; voice?: boolean }) {
  const say = useSay();
  const shown = voice ? say(text) : text;
  return (
    <>
      {emphasize(shown).map((part, index) => (part.key ? <mark key={index} className="key-reco">{part.text}</mark> : <span key={index}>{part.text}</span>))}
    </>
  );
}
