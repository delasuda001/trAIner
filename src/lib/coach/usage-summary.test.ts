import { describe, expect, it } from "vitest";
import { summarizeUsage, type UsageRecord } from "./usage-summary";

const now = new Date("2026-11-16T15:00:00Z");
function record(daysAgo: number, kind: string, input: number, output: number, cacheRead = 0): UsageRecord {
  return { createdAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), kind, subject: null, model: "claude-sonnet-5-5", outcome: "ok", inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheCreationTokens: 0, costUsd: 0.01, durationMs: 9000 };
}

describe("résumé de consommation Claude", () => {
  const records = [record(0.1, "session", 3000, 800, 1000), record(0.2, "chat", 2500, 300), record(3, "session", 3200, 900), record(20, "outlook", 2000, 200), record(45, "session", 1, 1)];
  const summary = summarizeUsage(records, now, "2026-11-16T05:00:00.000Z");

  it("totalise aujourd'hui, 7 et 30 jours, cache compris", () => {
    expect(summary.today.calls).toBe(2);
    expect(summary.today.totalTokens).toBe(3000 + 800 + 1000 + 2500 + 300);
    expect(summary.last7Days.calls).toBe(3);
    expect(summary.last30Days.calls).toBe(4);
  });

  it("donne la moyenne par analyse et par question, et la répartition par type", () => {
    expect(summary.averagePerQuestion).toEqual({ calls: 1, inputTokens: 2500, outputTokens: 300, cacheTokens: 0 });
    expect(summary.rejectionRate).toBe(0);
    expect(summary.byKind[0].kind).toBe("session");
    expect(summary.byKind.find((entry) => entry.kind === "outlook")?.calls).toBe(1);
  });
});
