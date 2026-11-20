import { describe, expect, it } from "vitest";
import { celebrated, celebrationMessage } from "./celebration";

describe("clin d'œil", () => {
  it("Marie seulement", () => {
    expect(celebrated("marie")).toBe(true);
    for (const id of ["bastien", "bastientest", "benoit", "charles", null]) expect(celebrated(id)).toBe(false);
  });
  it("« Let's go » ou « Bravo » suivi d'un des surnoms", () => {
    expect(celebrationMessage(() => 0)).toBe("Let's go chouchou d'amour !");
    expect(celebrationMessage(() => 0.99)).toBe("Bravo belle gosse !");
  });
});
