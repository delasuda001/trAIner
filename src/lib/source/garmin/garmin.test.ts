import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { GarminClient } from "./client";
import { extractFirstZipEntry } from "./fit";
import { garminGmtToIso, mapGarminActivity } from "./mapper";
import { GarminSource } from "./index";
import { garminActivityListItemSchema } from "./schemas";

function zipOf(name: string, content: Buffer): Buffer {
  const compressed = deflateRawSync(content);
  const fileName = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + fileName.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, fileName, compressed, central, fileName, end]);
}

describe("adaptateur Garmin", () => {
  it("convertit un résumé d'activité, cadence en pas/min (deux jambes)", () => {
    const item = garminActivityListItemSchema.parse({ activityId: 25068391782, activityName: "Toronto Course à pied", startTimeLocal: "2026-11-13 13:01:11", startTimeGMT: "2026-11-13 18:01:11", activityType: { typeKey: "running" }, distance: 10137.6, duration: 2864.8, movingDuration: 2858, averageSpeed: 3.539, averageHR: 160, averageRunningCadenceInStepsPerMinute: 166.8, hrTimeInZone_1: 102, hrTimeInZone_2: 321, hrTimeInZone_3: 815, hrTimeInZone_4: 531, hrTimeInZone_5: 1071, trainingEffectLabel: "VO2MAX", minTemperature: 10, maxTemperature: 24 });
    const activity = mapGarminActivity(item);
    expect(activity).toMatchObject({ sourceId: "25068391782", sport: "running", startTimeUtc: "2026-11-13T18:01:11Z", startTimeLocal: "2026-11-13T13:01:11", averageCadenceSpm: 166.8, averageTemperatureC: 17 });
    expect(activity.hrTimeInZonesS).toEqual([102, 321, 815, 531, 1071]);
  });

  it("convertit l'heure GMT de Garmin en ISO", () => {
    expect(garminGmtToIso("2026-11-13 18:01:11")).toBe("2026-11-13T18:01:11Z");
  });

  it("extrait le fichier FIT d'une archive ZIP", () => {
    const content = Buffer.from("contenu FIT factice ".repeat(20));
    expect(extractFirstZipEntry(zipOf("1_ACTIVITY.fit", content)).equals(content)).toBe(true);
  });

  it("échange la clé contre un jeton une seule fois et le renouvelle sur 401", async () => {
    const calls: string[] = [];
    let tokenCount = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/token")) {
        tokenCount += 1;
        expect((init?.headers as Record<string, string>).Authorization).toBe("ApiKey secret");
        return new Response(`jeton-${tokenCount}`);
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === "Bearer jeton-1" && calls.filter((call) => !call.endsWith("/token")).length === 2) return new Response("", { status: 401 });
      return new Response(JSON.stringify({ ok: auth }));
    });
    const client = new GarminClient({ apiKey: "secret", fetchImpl, sleep: async () => {} });
    await expect(client.getJson("/a")).resolves.toEqual({ ok: "Bearer jeton-1" });
    await expect(client.getJson("/b")).resolves.toEqual({ ok: "Bearer jeton-2" });
    expect(tokenCount).toBe(2);
  });

  it("renvoie null sur 404 (pas de données ce jour-là)", async () => {
    const fetchImpl = async (url: string) => (url.endsWith("/token") ? new Response("t") : new Response("{}", { status: 404 }));
    await expect(new GarminClient({ apiKey: "k", fetchImpl }).getJson("/x")).resolves.toBeNull();
  });
  it("ignore les jours de bien-être sans date au lieu d'échouer (sommeil, santé, VO2max, VFC)", async () => {
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/token")) return new Response("t");
      if (url.includes("/sleep-service/")) return new Response(JSON.stringify([{ calendarDate: "2026-11-10", sleepTimeSeconds: 27000 }, { calendarDate: null, sleepTimeSeconds: 0 }]));
      if (url.includes("/usersummary-service/")) return new Response(JSON.stringify({ data: [{ calendarDate: null, heartRate: { restingValue: 50 } }, { calendarDate: "2026-11-10", heartRate: { restingValue: 48 } }] }));
      if (url.includes("/maxmet/")) return new Response(JSON.stringify([{ generic: { calendarDate: null, vo2MaxValue: 50 } }]));
      if (url.includes("/hrv-service/")) return new Response(JSON.stringify({ hrvSummaries: [{ calendarDate: null, lastNightAvg: 40 }] }));
      return new Response("{}", { status: 404 });
    };
    const source = new GarminSource(new GarminClient({ apiKey: "k", fetchImpl, sleep: async () => {} }));
    const days = await source.getWellness("2026-11-01", "2026-11-12");
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "2026-11-10", sleepDurationS: 27000, restingHeartRateBpm: 48, vo2max: null, hrvLastNightMs: null });
  });
});
