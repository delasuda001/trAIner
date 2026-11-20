import { describe, expect, it } from "vitest";
import { systemPromptFor, rhythmPhrase } from "./athlete";
import { CHAT_SYSTEM_PROMPT } from "./chat-coach";
import { OUTLOOK_SYSTEM_PROMPT } from "./outlook-coach";
import { SESSION_SYSTEM_PROMPT } from "./session-coach";

describe("consignes du coach selon le profil", () => {
  it("laisse les consignes de Bastien identiques", () => {
    for (const prompt of [SESSION_SYSTEM_PROMPT, OUTLOOK_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT]) expect(systemPromptFor(prompt, { isAdmin: true, runsPerWeek12w: 1.4 })).toBe(prompt);
  });

  it("présente un invité avec son propre rythme, sans le nom ni le rythme de Bastien", () => {
    for (const prompt of [SESSION_SYSTEM_PROMPT, OUTLOOK_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT]) {
      const guest = systemPromptFor(prompt, { isAdmin: false, runsPerWeek12w: 5.6 });
      expect(guest).not.toContain("Bastien");
      expect(guest).not.toContain("1 à 2");
      expect(guest).toContain("environ 6 fois par semaine");
      expect(guest).toContain("Tu le tutoies");
      expect(guest.toLowerCase()).not.toContain("vouvoi");
    }
  });

  it("dit quand le rythme n'est pas encore connu", () => {
    expect(rhythmPhrase(null)).toContain("pas encore connu");
  });
});
