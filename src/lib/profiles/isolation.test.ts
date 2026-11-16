import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Isolation des profils : chaque profil écrit dans SA base, et rien n'est lisible
 * sans profil actif. Bases temporaires (jamais celle de Bastien).
 */
const dir = mkdtempSync(join(tmpdir(), "sillage-isolation-"));

type Modules = {
  context: typeof import("./context");
  client: typeof import("@/lib/db/client");
  goals: typeof import("@/lib/db/repositories/app-state-repository");
  feelings: typeof import("@/lib/db/repositories/feeling-repository");
};
let modules: Modules;
const zTitle = z.object({ title: z.string() });

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(dir, "admin.db")}`;
  process.env.SILLAGE_PROFILES_DIR = join(dir, "profiles");
  process.env.SILLAGE_REGISTRY_PATH = join(dir, "sillage.db");
  modules = {
    context: await import("./context"),
    client: await import("@/lib/db/client"),
    goals: await import("@/lib/db/repositories/app-state-repository"),
    feelings: await import("@/lib/db/repositories/feeling-repository"),
  };
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("isolation entre profils", () => {
  it("refuse tout accès en base sans profil actif", () => {
    expect(() => modules.client.getDb()).toThrow(/Aucun profil actif/);
  });

  it("place l'administrateur sur sa base historique et chaque invité sur la sienne", () => {
    const { databasePathFor } = modules.client;
    expect(databasePathFor({ id: "bastien", role: "admin" })).toBe(join(dir, "admin.db"));
    expect(databasePathFor({ id: "papa", role: "guest" })).toBe(join(dir, "profiles", "papa.db"));
  });

  it("n'expose jamais les données d'un profil à un autre", async () => {
    const { runAs } = modules.context;
    const bastien = { id: "bastien", name: "Bastien", role: "admin" as const };
    const papa = { id: "papa", name: "Papa", role: "guest" as const };
    runAs(bastien, () => modules.goals.createAppStateRepository().set("athlete_goal", { title: "semi en 1:27" }));
    runAs(papa, () => modules.goals.createAppStateRepository().set("athlete_goal", { title: "marathon" }));
    // Le contexte suit les attentes asynchrones.
    const seenByPapa = await runAs(papa, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return modules.goals.createAppStateRepository().get("athlete_goal", zTitle);
    });
    const seenByBastien = runAs(bastien, () => modules.goals.createAppStateRepository().get("athlete_goal", zTitle));
    expect(seenByPapa?.title).toBe("marathon");
    expect(seenByBastien?.title).toBe("semi en 1:27");
    const frere = { id: "frere", name: "Frère", role: "guest" as const };
    expect(runAs(frere, () => modules.goals.createAppStateRepository().get("athlete_goal", zTitle))).toBeNull();
  });
});
