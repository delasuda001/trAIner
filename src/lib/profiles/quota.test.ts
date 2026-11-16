import { describe, expect, it } from "vitest";
import { decideQuota, type QuotaInput } from "./quota";

const now = new Date("2026-11-16T20:00:00Z");
const call = (hoursAgo: number, tokens: number) => ({ createdAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(), inputTokens: tokens, outputTokens: 0, cacheCreationTokens: 0 });

function input(overrides: Partial<QuotaInput>): QuotaInput {
  return { role: "guest", dailyCap: 40_000, weeklyCap: 150_000, own: [], allGuests: [], guestsWeeklyCap: 250_000, windows: [], now, startOfTodayIso: "2026-11-16T05:00:00.000Z", ...overrides };
}

describe("plafonds des invités", () => {
  it("laisse passer tant que l'estimation tient dans le plafond du jour", () => {
    expect(decideQuota(input({ own: [call(1, 30_000)] })).allowed).toBe(true);
    const denied = decideQuota(input({ own: [call(1, 32_000)] }));
    expect(denied.allowed).toBe(false);
    expect(denied.remainingToday).toBe(8_000);
  });

  it("ne compte pas la relecture du cache, et la veille ne pèse que sur la semaine", () => {
    const yesterday = { ...call(20, 39_000) };
    const state = decideQuota(input({ own: [yesterday, { ...call(1, 0), cacheCreationTokens: 0, inputTokens: 0, outputTokens: 1_000 }] }));
    expect(state.usedToday).toBe(1_000);
    expect(state.usedWeek).toBe(40_000);
    expect(state.allowed).toBe(true);
  });

  it("refuse au-delà du plafond de la semaine ou du plafond commun", () => {
    expect(decideQuota(input({ own: [call(30, 145_000)] })).allowed).toBe(false);
    expect(decideQuota(input({ allGuests: [call(30, 245_000)] })).allowed).toBe(false);
  });

  it("protège l'abonnement de Bastien quand la fenêtre de 5 h est chargée", () => {
    const windows = [{ window: "five_hour", utilization: 0.65, resetsAt: new Date(now.getTime() + 3_600_000).toISOString(), status: "allowed" }];
    expect(decideQuota(input({ windows })).allowed).toBe(false);
    expect(decideQuota(input({ windows: [{ ...windows[0], utilization: 0.3 }] })).allowed).toBe(true);
  });

  it("n'impose aucun plafond à l'administrateur", () => {
    expect(decideQuota(input({ role: "admin", own: [call(1, 900_000)] })).allowed).toBe(true);
  });
});
