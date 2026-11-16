import { describe, expect, it } from "vitest";
import { budgetFromEnv, canSpend, DEFAULT_BUDGET } from "./budget";

const now = new Date("2026-11-17T03:00:00Z");
const base = { estimate: 9000, nightUsed: 0, weekUsed: 0, config: DEFAULT_BUDGET, windows: [], now };

describe("plafonds du banc", () => {
  it("autorise sous les plafonds", () => {
    expect(canSpend(base)).toEqual({ ok: true });
  });

  it("s'arrête avant de dépasser le plafond de la nuit ou de la semaine", () => {
    expect(canSpend({ ...base, nightUsed: 35_000 })).toMatchObject({ ok: false });
    expect(canSpend({ ...base, weekUsed: 95_000 })).toMatchObject({ ok: false });
  });

  it("s'arrête si la fenêtre de 5 h ou hebdomadaire est trop entamée, ignore une fenêtre déjà réinitialisée", () => {
    expect(canSpend({ ...base, windows: [{ window: "five_hour", utilization: 0.65, resetsAt: "2026-11-17T05:00:00Z", status: "allowed" }] })).toMatchObject({ ok: false });
    expect(canSpend({ ...base, windows: [{ window: "seven_day", utilization: 72, resetsAt: "2026-11-20T00:00:00Z", status: "allowed_warning" }] })).toMatchObject({ ok: false });
    expect(canSpend({ ...base, windows: [{ window: "five_hour", utilization: 0.94, resetsAt: "2026-11-17T01:00:00Z", status: "allowed" }] })).toEqual({ ok: true });
  });

  it("lit les plafonds configurés", () => {
    expect(budgetFromEnv({ BENCH_WEEK_BUDGET_TOKENS: "150000" }).weekTokens).toBe(150_000);
    expect(budgetFromEnv({ BENCH_WEEK_BUDGET_TOKENS: "abc" }).weekTokens).toBe(100_000);
  });
});
