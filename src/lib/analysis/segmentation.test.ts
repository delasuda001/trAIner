import { describe, expect, it } from "vitest";
import { segmentActivity } from "./segmentation";

const lap = (distance: number, duration: number) => ({ id: "lap", name: "Lap", distance, elapsed_time: duration, moving_time: duration, average_speed: distance / duration });

describe("segmentation descriptive", () => {
  it.each([[500, 1], [600, 3], [3000, 4], [6000, 6], [10000, 8] as const])("applique le découpage adaptatif", (distance, count) => {
    expect(segmentActivity({ laps: [lap(distance, count * 120)] }, "adaptive").segments).toHaveLength(count);
  });
  it("plafonne à 8 segments", () => expect(segmentActivity({ laps: [lap(15000, 1600)] }, "adaptive").segments.length).toBe(8));
  it("ne crée pas de segment sous 90 secondes", () => expect(segmentActivity({ laps: [lap(3000, 200)] }, "thirds").segments.every((segment) => segment.durationS >= 90)).toBe(true));
  it("crée un lap synthétique sans intervalles", () => expect(segmentActivity({ laps: [] }, "lap")).toMatchObject({ segments: [{ lapId: "synthetic-activity" }] }));
});