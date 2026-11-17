import { describe, expect, it } from "vitest";
import { fingerprintIsCurrent, hashPayload, storedFingerprint } from "./fingerprint";

const withoutGoal = { seance: "10 km", objectif: {} };
const withGoal = { seance: "10 km", objectif: { titre: "semi en 1:45" } };

describe("empreintes du coach", () => {
  it("garde une analyse à jour quand seul l'objectif a changé", () => {
    const stored = storedFingerprint("session-v12", withoutGoal, withoutGoal);
    expect(fingerprintIsCurrent(stored, "session-v12", withGoal, () => withoutGoal)).toBe(true);
  });

  it("la périme quand la séance elle-même a changé", () => {
    const stored = storedFingerprint("session-v12", withoutGoal, withoutGoal);
    const changed = { seance: "10 km", ressenti: "7/10", objectif: {} };
    expect(fingerprintIsCurrent(stored, "session-v12", changed, () => changed)).toBe(false);
  });

  it("la périme quand la version du prompt change", () => {
    const stored = storedFingerprint("session-v12", withoutGoal, withoutGoal);
    expect(fingerprintIsCurrent(stored, "session-v13", withoutGoal, () => withoutGoal)).toBe(false);
  });

  it("relit les anciennes empreintes simples comme avant", () => {
    const legacy = hashPayload("session-v12", withoutGoal);
    expect(fingerprintIsCurrent(legacy, "session-v12", withoutGoal, () => withoutGoal)).toBe(true);
    expect(fingerprintIsCurrent(legacy, "session-v12", withGoal, () => withoutGoal)).toBe(false);
    expect(storedFingerprint("session-v12", withoutGoal, null)).toBe(legacy);
  });
});
