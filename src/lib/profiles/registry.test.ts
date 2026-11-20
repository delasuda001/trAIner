import Database from "better-sqlite3";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { generateAccessCode, generateToken } from "./credentials";
import { ADMIN_ID, createRegistry } from "./registry";
import { garminEnvVarFor, memberIdFromName } from "./types";

let now = new Date("2026-11-16T12:00:00Z");

function registry() {
  const value = createRegistry(new Database(":memory:"), () => now);
  value.ensureAdmin();
  return value;
}

describe("registre des profils", () => {
  it("crée Bastien administrateur, sans code (entrée par lien local), sur la clé Garmin historique", () => {
    const value = registry();
    expect(value.find(ADMIN_ID)).toMatchObject({ role: "admin", hasCode: false, garminEnvVar: "GARMIN_API_KEY" });
    expect(value.findByCode("")).toBeNull();
  });

  it("crée un invité avec plafonds par défaut et sa propre variable Garmin, retrouvé par son seul code", () => {
    const value = registry();
    const code = generateAccessCode();
    const guest = value.createGuest({ id: "papa", name: "Papa", code });
    expect(guest).toMatchObject({ role: "guest", hasCode: true, garminEnvVar: "GARMIN_API_KEY_PAPA", dailyTokenCap: 40_000, weeklyTokenCap: 150_000, onboardedAt: null });
    expect(value.findByCode(code.toUpperCase())?.id).toBe("papa");
    expect(value.findByCode(generateAccessCode())).toBeNull();
    expect(() => value.createGuest({ id: "papa", name: "Papa 2", code })).toThrow();
  });

  it("gère les sessions par appareil : révocation d'un appareil, de tout un profil, expiration", () => {
    now = new Date("2026-11-16T12:00:00Z");
    const value = registry();
    value.createGuest({ id: "frere", name: "Frère", code: generateAccessCode() });
    const phone = generateToken();
    const laptop = generateToken();
    value.createSession("frere", phone, "iPhone, Safari");
    value.createSession("frere", laptop, "Mac, Safari");
    expect(value.resolveSession(phone)?.id).toBe("frere");
    const sessions = value.listSessions("frere");
    expect(sessions).toHaveLength(2);
    value.revokeSession(sessions.find((entry) => entry.device === "iPhone, Safari")?.id ?? "");
    expect(value.resolveSession(phone)).toBeNull();
    expect(value.resolveSession(laptop)?.id).toBe("frere");
    value.revokeAllSessions("frere");
    expect(value.resolveSession(laptop)).toBeNull();
    const later = generateToken();
    value.createSession("frere", later, "iPhone, Safari");
    now = new Date("2027-06-01T12:00:00Z");
    expect(value.resolveSession(later)).toBeNull();
    now = new Date("2026-11-16T12:00:00Z");
  });

  it("désactiver un profil coupe ses appareils ; l'administrateur ne peut pas être désactivé", () => {
    const value = registry();
    value.createGuest({ id: "frere", name: "Frère", code: generateAccessCode() });
    const token = generateToken();
    value.createSession("frere", token, "iPhone, Safari");
    value.setDisabled("frere", true);
    expect(value.resolveSession(token)).toBeNull();
    value.setDisabled(ADMIN_ID, true);
    expect(value.find(ADMIN_ID)?.disabledAt).toBeNull();
  });

  it("n'accepte un lien d'invitation qu'une fois, et seulement le dernier émis", () => {
    const value = registry();
    value.createGuest({ id: "papa", name: "Papa", code: generateAccessCode() });
    const first = generateToken();
    const second = generateToken();
    value.createInvitation("papa", first);
    value.createInvitation("papa", second);
    expect(value.consumeInvitation(first)).toBeNull();
    expect(value.consumeInvitation(second)?.id).toBe("papa");
    expect(value.consumeInvitation(second)).toBeNull();
    const expired = generateToken();
    value.createInvitation("papa", expired);
    now = new Date("2026-11-24T12:00:00Z");
    expect(value.consumeInvitation(expired)).toBeNull();
    now = new Date("2026-11-16T12:00:00Z");
  });

  it("tient un journal des connexions", () => {
    const value = registry();
    value.logLogin({ profileId: null, method: "code", outcome: "refused", address: "1.2.3.4", device: "iPhone, Safari" });
    expect(value.listLogins()).toEqual([expect.objectContaining({ outcome: "refused", address: "1.2.3.4" })]);
  });

  it("garde un seul pouce par sujet et filtre les retours par profil", () => {
    const value = registry();
    const base = { page: "/activities/x", category: "analyse" as const, subjectKind: "session" as const, subjectId: "garmin:1", promptVersion: "session-v12", note: "" };
    value.rateSubject("papa", { ...base, rating: 1 });
    value.rateSubject("papa", { ...base, rating: -1, note: "trop vague" });
    value.addFeedback("frere", { ...base, rating: null, subjectKind: null, subjectId: null, category: "idee", note: "voir le dénivelé" });
    expect(value.ratingOf("papa", "session", "garmin:1")).toBe(-1);
    expect(value.listFeedback({ profileId: "papa" })).toHaveLength(1);
    expect(value.listFeedback({ profileId: "frere" }).map((entry) => entry.note)).toEqual(["voir le dénivelé"]);
    expect(value.listFeedback()).toHaveLength(2);
  });
});

describe("identifiants", () => {
  it("dérive un identifiant simple du prénom affiché", () => {
    expect(memberIdFromName("Frère")).toBe("frere");
    expect(memberIdFromName("Papa Jean-Luc")).toBe("papajeanluc");
    expect(memberIdFromName("É")).toBe("profile");
    expect(garminEnvVarFor("frere", "guest")).toBe("GARMIN_API_KEY_FRERE");
  });

  it("crée un profil de test sur la clé Garmin du profil copié, sans code, et le remet comme neuf", () => {
    const value = registry();
    const tester = value.createTestGuest({ id: "bastientest", name: "Bastien", testOf: ADMIN_ID });
    expect(tester).toMatchObject({ role: "guest", testOf: ADMIN_ID, garminEnvVar: "GARMIN_API_KEY", hasCode: false, dailyTokenCap: 40_000 });
    value.markOnboarded("bastientest");
    value.markLogin("bastientest");
    const token = generateToken();
    value.createSession("bastientest", token, "iPhone");
    value.resetFirstVisit("bastientest");
    expect(value.find("bastientest")).toMatchObject({ onboardedAt: null, lastLoginAt: null });
    expect(value.resolveSession(token)).toBeNull();
    expect(value.find(ADMIN_ID)?.testOf).toBeNull();
    value.createGuest({ id: "marie", name: "Marie", code: generateAccessCode() });
    expect(() => value.resetFirstVisit("marie")).toThrow();
  });
});

describe("connexion par prénom et code court", () => {
  it("prénom (sans accents ni casse) + code à 6 chiffres ; le code seul ne suffit pas à le retrouver", async () => {
    const { generateGuestCode, plausibleCode } = await import("./credentials");
    const value = registry();
    const code = generateGuestCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(plausibleCode(code)).toBe(true);
    value.createGuest({ id: "benoit", name: "Benoît", code: generateAccessCode() });
    value.setGuestCode("benoit", code);
    expect(value.find("benoit")?.guestCode).toBe(code);
    expect(value.findByNameAndCode(" benoit ", code)?.id).toBe("benoit");
    expect(value.findByNameAndCode("BENOÎT", code)?.id).toBe("benoit");
    expect(value.findByNameAndCode("Marie", code)).toBeNull();
    expect(value.findByNameAndCode("Benoît", "000000" === code ? "111111" : "000000")).toBeNull();
  });

  it("deux profils au même prénom : le code départage ; un ancien code long marche encore avec le prénom", () => {
    const value = registry();
    const long = generateAccessCode();
    value.createGuest({ id: "marie", name: "Marie", code: long });
    value.createGuest({ id: "marie2", name: "Marie", code: generateAccessCode() });
    value.setGuestCode("marie2", "123456");
    expect(value.findByNameAndCode("marie", long)?.id).toBe("marie");
    expect(value.findByNameAndCode("marie", "123456")?.id).toBe("marie2");
    expect(value.find("marie")?.guestCode).toBeNull();
  });

  it("profil désactivé : refusé même avec le bon code", () => {
    const value = registry();
    value.createGuest({ id: "charles", name: "Charles", code: generateAccessCode() });
    value.setGuestCode("charles", "654321");
    value.setDisabled("charles", true);
    expect(value.findByNameAndCode("Charles", "654321")).toBeNull();
  });
});

describe("réinitialiser l'accueil d'un invité", () => {
  it("appareils déconnectés, bienvenue à revoir, guide à rouvrir ; refusé pour l'administrateur", () => {
    const value = registry();
    value.createGuest({ id: "charles", name: "Charles", code: generateAccessCode() });
    value.markOnboarded("charles");
    const token = generateToken();
    value.createSession("charles", token, "iPhone, Safari");
    value.resetOnboarding("charles");
    expect(value.find("charles")?.onboardedAt).toBeNull();
    expect(value.resolveSession(token)).toBeNull();
    expect(value.getSetting("guide_reset_charles", z.string())).toBe(now.toISOString());
    expect(() => value.resetOnboarding(ADMIN_ID)).toThrow();
  });
});
