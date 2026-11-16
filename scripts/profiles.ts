/**
 * Profils en ligne de commande (sur le Mac uniquement : sert à ouvrir la première session de Bastien).
 * Usage : npm run profiles -- invitation [profil] [--url=https://…]   lien personnel à usage unique (7 jours)
 *         npm run profiles -- liste                                     profils, appareils connectés
 */
import { loadEnvConfig } from "@next/env";
import { generateToken } from "@/lib/profiles/credentials";
import { getRegistry } from "@/lib/profiles/context";
import { ADMIN_ID } from "@/lib/profiles/registry";

loadEnvConfig(process.cwd());

const [command = "liste", target = ADMIN_ID] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const base = process.argv.find((arg) => arg.startsWith("--url="))?.slice(6) ?? process.env.SILLAGE_PUBLIC_URL ?? "http://localhost:3000";
const registry = getRegistry();

if (command === "invitation") {
  const record = registry.find(target);
  if (!record) throw new Error(`Profil inconnu : ${target}`);
  const token = generateToken();
  const { expiresAt } = registry.createInvitation(record.id, token);
  console.log(`Lien pour ${record.name} (usage unique, jusqu'au ${expiresAt.slice(0, 10)}) :`);
  console.log(`${base.replace(/\/$/, "")}/api/session/invitation?t=${token}`);
} else {
  for (const record of registry.list()) {
    const sessions = registry.listSessions(record.id);
    console.log(`${record.id.padEnd(12)} ${record.name.padEnd(12)} ${record.role.padEnd(6)} code ${record.hasCode ? "oui" : "non"} · ${sessions.length} appareil(s)${record.disabledAt ? " · désactivé" : ""}`);
  }
}
