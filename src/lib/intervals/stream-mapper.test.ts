import { describe, expect, it } from "vitest";
import { normalizeActivityStreams } from "./stream-mapper";

const stream = (type: string, data: unknown[]) => ({ type, data });
describe("normalisation des streams", () => {
  it("retient les séries autorisées et exclut latlng", () => {
    const result = normalizeActivityStreams("i1", [stream("time", [0, 1]), stream("distance", [0, 3]), stream("velocity_smooth", [2, null]), stream("latlng", [[1, 2], [3, 4]])]);
    expect(result).toMatchObject({ activityId: "i1", sampleCount: 2, availability: { speed: true, heartRate: false } });
    expect(JSON.stringify(result)).not.toMatch(/latlng|latitude|longitude|position/i);
  });
  it("signale les longueurs incohérentes", () => expect(normalizeActivityStreams("i1", [stream("time", [0, 1]), stream("heartrate", [120])])).toMatchObject({ availability: { heartRate: false }, qualityWarnings: ["Série heartRateBpm ignorée : longueur incohérente"] }));
});