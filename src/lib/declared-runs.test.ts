import { describe, expect, it } from "vitest";
import { addDeclaredRun, removeDeclaredRun } from "./declared-runs";

describe("sorties déclarées sans montre", () => {
  it("ajout trié, suppression, futur refusé", () => {
    const list = addDeclaredRun(addDeclaredRun([], { date: "2026-11-10", durationMin: 40 }, "b", "2026-11-19"), { date: "2026-11-03", durationMin: 30 }, "a", "2026-11-19");
    expect(list.map((run) => run.id)).toEqual(["a", "b"]);
    expect(removeDeclaredRun(list, "a").map((run) => run.id)).toEqual(["b"]);
    expect(() => addDeclaredRun([], { date: "2026-11-20", durationMin: 30 }, "c", "2026-11-19")).toThrow();
  });
});
