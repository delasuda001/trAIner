import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Profil invité de test de Bastien : copie de sa base, réinitialisable, sans jamais
 * modifier la base de Bastien. Bases temporaires.
 */
const dir = mkdtempSync(join(tmpdir(), "sillage-test-profile-"));

type Modules = {
  context: typeof import("@/lib/profiles/context");
  client: typeof import("@/lib/db/client");
  appState: typeof import("@/lib/db/repositories/app-state-repository");
  service: typeof import("./test-profile-service");
  coach: typeof import("@/lib/coach");
  flags: typeof import("@/lib/profiles/test-profile");
};
let modules: Modules;
const zTitle = z.object({ title: z.string() });
const bastien = { id: "bastien", name: "Bastien", role: "admin" as const };
const tester = { id: "bastientest", name: "Bastien", role: "guest" as const };

function count(member: { id: string; role: "admin" | "guest" }, table: string): number {
  return (modules.client.getDbFor(member).$client.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(dir, "admin.db")}`;
  process.env.SILLAGE_PROFILES_DIR = join(dir, "profiles");
  process.env.SILLAGE_REGISTRY_PATH = join(dir, "sillage.db");
  modules = {
    context: await import("@/lib/profiles/context"),
    client: await import("@/lib/db/client"),
    appState: await import("@/lib/db/repositories/app-state-repository"),
    service: await import("./test-profile-service"),
    coach: await import("@/lib/coach"),
    flags: await import("@/lib/profiles/test-profile"),
  };
  const { runAs } = modules.context;
  runAs(bastien, () => modules.appState.createAppStateRepository().set("athlete_goal", { title: "semi en 1:27" }));
  const admin = modules.client.getDbFor(bastien).$client;
  admin.prepare("INSERT INTO coach_usage (id, created_at, kind, model, outcome, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens) VALUES ('u1', ?, 'session', 'sonnet', 'ok', 9000, 1000, 0, 0)").run(new Date().toISOString());
  admin.prepare("INSERT INTO coach_chat_messages (id, role, content_json, created_at) VALUES ('m1', 'user', '{}', ?)").run(new Date().toISOString());
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("profil invité de test", () => {
  it("crée un invité marqué test, sur la clé Garmin de Bastien, avec une copie de sa base sans consommation ni chat", async () => {
    const result = await modules.service.resetTestProfile("https://exemple.ts.net");
    expect(result.link).toMatch(/^https:\/\/exemple\.ts\.net\/api\/session\/invitation\?t=/);
    const record = modules.context.getRegistry().find("bastientest");
    expect(record).toMatchObject({ role: "guest", testOf: "bastien", garminEnvVar: "GARMIN_API_KEY", hasCode: false, onboardedAt: null });
    expect(modules.context.runAs(tester, () => modules.appState.createAppStateRepository().get("athlete_goal", zTitle))?.title).toBe("semi en 1:27");
    expect(count(tester, "coach_usage")).toBe(0);
    expect(count(tester, "coach_chat_messages")).toBe(0);
    // La base de Bastien est intacte.
    expect(count(bastien, "coach_usage")).toBe(1);
    expect(count(bastien, "coach_chat_messages")).toBe(1);
  });

  it("repart d'une copie neuve et refait la première connexion à chaque réinitialisation", async () => {
    const { runAs, getRegistry } = modules.context;
    runAs(tester, () => modules.appState.createAppStateRepository().set("athlete_goal", { title: "changé par le test" }));
    getRegistry().markOnboarded("bastientest");
    await modules.service.resetTestProfile("https://exemple.ts.net");
    expect(runAs(tester, () => modules.appState.createAppStateRepository().get("athlete_goal", zTitle))?.title).toBe("semi en 1:27");
    expect(getRegistry().find("bastientest")?.onboardedAt).toBeNull();
    expect(runAs(bastien, () => modules.appState.createAppStateRepository().get("athlete_goal", zTitle))?.title).toBe("semi en 1:27");
  });

  it("simule le coach du profil de test par défaut, jamais celui de Bastien", () => {
    const { runAs, getRegistry } = modules.context;
    expect(runAs(tester, () => modules.coach.getLlmClient().name)).toMatch(/^simulé/);
    expect(runAs(bastien, () => modules.coach.getLlmClient().name)).not.toMatch(/^simulé/);
    getRegistry().setSetting(modules.flags.TEST_COACH_SIMULATED_KEY, false);
    expect(runAs(tester, () => modules.coach.getLlmClient().name)).not.toMatch(/^simulé/);
    getRegistry().setSetting(modules.flags.TEST_COACH_SIMULATED_KEY, true);
  });
});
