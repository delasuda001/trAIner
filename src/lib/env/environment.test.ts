import { describe, expect, it } from "vitest";
import { otherEnvOrigin, sessionCookieName } from "./environment";
import { createHandoffToken, verifyHandoffToken } from "./handoff";

describe("deux environnements", () => {
  it("adresse de l'autre environnement : locale sur le Mac, publique sinon (port 8443 pour le test)", () => {
    expect(otherEnvOrigin("127.0.0.1:3000", "test")).toBe("http://127.0.0.1:3100");
    expect(otherEnvOrigin("localhost:3100", "prod")).toBe("http://localhost:3000");
    expect(otherEnvOrigin("mac.tail.ts.net", "test")).toBe("https://mac.tail.ts.net:8443");
    expect(otherEnvOrigin("mac.tail.ts.net:8443", "prod")).toBe("https://mac.tail.ts.net");
  });

  it("un cookie par environnement", () => {
    expect(sessionCookieName("prod")).toBe("sillage_session");
    expect(sessionCookieName("test")).toBe("sillage_test_session");
  });

  it("jeton de passage : signé, court, refusé s'il est modifié, expiré ou signé avec un autre secret", () => {
    const secret = "un-secret-assez-long-pour-le-test";
    const now = 1_800_000_000_000;
    const token = createHandoffToken("bastien", secret, now);
    expect(verifyHandoffToken(token, secret, now + 1_000)).toEqual({ memberId: "bastien" });
    expect(verifyHandoffToken(token, secret, now + 61_000)).toBeNull();
    expect(verifyHandoffToken(token, "un-autre-secret-assez-long-xx", now)).toBeNull();
    expect(verifyHandoffToken(token.replace("bastien", "charles"), secret, now)).toBeNull();
    expect(verifyHandoffToken("n'importe quoi", secret, now)).toBeNull();
  });
});
