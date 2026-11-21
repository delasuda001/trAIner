import { describe, expect, it } from "vitest";
import { mergeRateWindows, windowsFromPlanUsage } from "./rate-limits";

const usage = {
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 3, resets_at: "2026-11-21T19:50:00.052972+00:00", limit_dollars: null },
    seven_day: { utilization: 62, resets_at: "2026-11-24T07:00:00.052991+00:00" },
    seven_day_opus: null,
    limits: [],
  },
};

describe("relevé de l'abonnement", () => {
  it("lit les fenêtres du relevé /usage en fraction", () => {
    expect(windowsFromPlanUsage(usage)).toEqual([
      { status: "allowed", window: "five_hour", utilization: 0.03, resetsAt: "2026-11-21T19:50:00.052Z" },
      { status: "allowed", window: "seven_day", utilization: 0.62, resetsAt: "2026-11-24T07:00:00.052Z" },
    ]);
  });

  it("1 % reste 1 % (pas 100 %) et 100 % est un refus", () => {
    const windows = windowsFromPlanUsage({ rate_limits_available: true, rate_limits: { five_hour: { utilization: 1, resets_at: null }, seven_day: { utilization: 100, resets_at: null } } });
    expect(windows?.map((window) => [window.utilization, window.status])).toEqual([[0.01, "allowed"], [1, "rejected"]]);
  });

  it("rend null sans relevé exploitable", () => {
    expect(windowsFromPlanUsage({ rate_limits_available: false, rate_limits: null })).toBeNull();
    expect(windowsFromPlanUsage({ nope: true })).toBeNull();
    expect(windowsFromPlanUsage({ rate_limits_available: true, rate_limits: { five_hour: null } })).toBeNull();
  });

  it("un événement d'appel sans pourcentage garde le pourcentage connu de la même fenêtre", () => {
    const stored = { five_hour: { status: "allowed", window: "five_hour", utilization: 0.03, resetsAt: "2026-11-21T19:50:00.052Z", seenAt: "2026-11-21T15:00:00Z" } };
    const merged = mergeRateWindows(stored, [{ status: "allowed", window: "five_hour", utilization: null, resetsAt: "2026-11-21T19:50:00.000Z" }], "2026-11-21T15:10:00Z");
    expect(merged.five_hour).toMatchObject({ utilization: 0.03, resetsAt: "2026-11-21T19:50:00.000Z", seenAt: "2026-11-21T15:10:00Z" });
    // Nouvelle fenêtre (autre remise à zéro) : l'ancien pourcentage ne vaut plus.
    const reset = mergeRateWindows(stored, [{ status: "allowed", window: "five_hour", utilization: null, resetsAt: "2026-11-22T01:00:00.000Z" }], "2026-11-21T20:00:00Z");
    expect(reset.five_hour.utilization).toBeNull();
  });

  it("un relevé complet remplace l'ancien état, y compris une fenêtre périmée", () => {
    const stored = { seven_day: { status: "allowed_warning", window: "seven_day", utilization: 0.76, resetsAt: "2026-11-17T07:00:00.000Z", seenAt: "2026-11-16T21:00:15Z" } };
    const merged = mergeRateWindows(stored, windowsFromPlanUsage(usage) ?? [], "2026-11-21T15:21:00Z");
    expect(merged.seven_day).toMatchObject({ status: "allowed", utilization: 0.62, resetsAt: "2026-11-24T07:00:00.052Z" });
    expect(Object.keys(merged).sort()).toEqual(["five_hour", "seven_day"]);
  });
});
