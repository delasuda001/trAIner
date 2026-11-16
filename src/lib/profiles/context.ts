import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { ADMIN_ID, createRegistry, type Registry } from "./registry";
import type { Member, MemberRecord } from "./types";

/**
 * Profil actif d'un traitement serveur. Toute lecture ou écriture en base passe
 * par `getDb()`, qui exige un profil actif : sans profil, erreur, jamais de
 * repli silencieux sur la base de Bastien.
 */
const storage = new AsyncLocalStorage<Member>();

export function runAs<T>(member: Member, fn: () => T): T {
  return storage.run({ id: member.id, name: member.name, role: member.role }, fn);
}

export function activeMember(): Member | null {
  return storage.getStore() ?? null;
}

export function requireActiveMember(): Member {
  const member = storage.getStore();
  if (!member) throw new Error("Aucun profil actif : accès aux données refusé.");
  return member;
}

const registryPath = resolve(process.env.SILLAGE_REGISTRY_PATH ?? "./data/sillage.db");
const globalForRegistry = globalThis as typeof globalThis & { sillageRegistry?: Registry };

export function getRegistry(): Registry {
  if (!globalForRegistry.sillageRegistry) {
    mkdirSync(dirname(registryPath), { recursive: true });
    const connection = new Database(registryPath);
    connection.pragma("journal_mode = WAL");
    const registry = createRegistry(connection);
    registry.ensureAdmin();
    globalForRegistry.sillageRegistry = registry;
  }
  return globalForRegistry.sillageRegistry;
}

export function toMember(record: MemberRecord): Member {
  return { id: record.id, name: record.name, role: record.role };
}

/** Pour les scripts (banc, gel du jeu de tests) : ils travaillent sur le profil de Bastien. */
export function adminMember(): Member {
  return toMember(getRegistry().find(ADMIN_ID) ?? getRegistry().ensureAdmin());
}
