import { describe, expect, it } from "vitest";
import { createLoginThrottle, deviceLabel, generateAccessCode, generateToken, hashCode, looksLikeToken, plausibleCode, tokenDigest, verifyCode } from "./credentials";

describe("codes d'accès", () => {
  it("génère un code long et lisible, vérifié malgré la casse et les espaces", () => {
    const code = generateAccessCode();
    expect(code).toMatch(/^([a-z2-9]{4}-){4}[a-z2-9]{4}$/);
    expect(plausibleCode(code.toUpperCase().replaceAll("-", " "))).toBe(true);
    expect(plausibleCode("1234")).toBe(false);
    const { hash, salt } = hashCode(code);
    expect(verifyCode(code.toUpperCase().replaceAll("-", " "), hash, salt)).toBe(true);
    expect(verifyCode(generateAccessCode(), hash, salt)).toBe(false);
  });
});

describe("jetons", () => {
  it("produit des jetons de 256 bits dont seule l'empreinte est stockée", () => {
    const token = generateToken();
    expect(looksLikeToken(token)).toBe(true);
    expect(looksLikeToken("abc")).toBe(false);
    expect(looksLikeToken(undefined)).toBe(false);
    expect(tokenDigest(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenDigest(token)).not.toContain(token);
  });

  it("décrit l'appareil sans garder le User-Agent", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1")).toBe("iPhone, Safari");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36")).toBe("Android, Chrome");
    expect(deviceLabel(null)).toBe("appareil inconnu");
  });
});

describe("freinage des essais", () => {
  it("bloque une adresse après 5 échecs, sans toucher les autres", () => {
    const throttle = createLoginThrottle({ perKeyLockMs: 60_000 });
    for (let index = 0; index < 5; index += 1) throttle.fail("1.2.3.4", 0);
    expect(throttle.lockedFor("1.2.3.4", 1_000)).toBeGreaterThan(0);
    expect(throttle.lockedFor("5.6.7.8", 1_000)).toBe(0);
    expect(throttle.lockedFor("1.2.3.4", 61_000)).toBe(0);
  });

  it("bloque tout le monde après 20 échecs en une heure, même d'adresses différentes", () => {
    const throttle = createLoginThrottle({ globalLockMs: 60_000 });
    for (let index = 0; index < 20; index += 1) throttle.fail(`10.0.0.${index}`, index);
    expect(throttle.lockedFor("8.8.8.8", 100)).toBeGreaterThan(0);
    expect(throttle.lockedFor("8.8.8.8", 70_000)).toBe(0);
  });
});
