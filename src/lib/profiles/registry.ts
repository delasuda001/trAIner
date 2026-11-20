import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { hashCode, INVITATION_TTL_MS, normalizeName, SESSION_TTL_S, tokenDigest, verifyCode } from "./credentials";
import { DEFAULT_GUEST_DAILY_CAP, DEFAULT_GUEST_WEEKLY_CAP, garminEnvVarFor, MEMBER_ID_PATTERN, type MemberRecord } from "./types";

/**
 * Registre central (`data/sillage.db`) : profils, réglages communs, retours.
 * Il ne contient AUCUNE donnée d'entraînement : celles-ci vivent dans la base
 * propre à chaque profil (cf. `db/client.ts`).
 */

const MIGRATIONS: string[] = [
  `CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    code_hash TEXT,
    code_salt TEXT,
    session_version INTEGER NOT NULL DEFAULT 1,
    garmin_env_var TEXT NOT NULL,
    daily_token_cap INTEGER,
    weekly_token_cap INTEGER,
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    onboarded_at TEXT,
    disabled_at TEXT
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    page TEXT NOT NULL,
    category TEXT NOT NULL,
    rating INTEGER,
    subject_kind TEXT,
    subject_id TEXT,
    prompt_version TEXT,
    note TEXT NOT NULL
  );
  CREATE INDEX feedback_created_idx ON feedback(created_at);
  CREATE INDEX feedback_subject_idx ON feedback(profile_id, subject_kind, subject_id);`,
  `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    device TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE INDEX sessions_profile_idx ON sessions(profile_id);
  CREATE TABLE invitations (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE TABLE login_events (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    profile_id TEXT,
    method TEXT NOT NULL,
    outcome TEXT NOT NULL,
    address TEXT,
    device TEXT NOT NULL
  );
  CREATE INDEX login_events_at_idx ON login_events(at);`,
  // Profil invité de test de Bastien : copie de sa base, réinitialisable (`test_of` = profil copié).
  `ALTER TABLE profiles ADD COLUMN test_of TEXT;`,
  // Code personnel court des invités, gardé lisible pour que Bastien puisse le redonner (le registre reste sur son Mac).
  `ALTER TABLE profiles ADD COLUMN guest_code TEXT;`,
];

export const ADMIN_ID = "bastien";

const profileRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["admin", "guest"]),
  code_hash: z.string().nullable(),
  code_salt: z.string().nullable(),
  session_version: z.number(),
  garmin_env_var: z.string(),
  daily_token_cap: z.number().nullable(),
  weekly_token_cap: z.number().nullable(),
  created_at: z.string(),
  last_login_at: z.string().nullable(),
  onboarded_at: z.string().nullable(),
  disabled_at: z.string().nullable(),
  test_of: z.string().nullable().default(null),
  guest_code: z.string().nullable().default(null),
});
type ProfileRow = z.infer<typeof profileRowSchema>;

function toRecord(row: ProfileRow): MemberRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    hasCode: row.code_hash != null,
    garminEnvVar: row.garmin_env_var,
    dailyTokenCap: row.daily_token_cap,
    weeklyTokenCap: row.weekly_token_cap,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    onboardedAt: row.onboarded_at,
    disabledAt: row.disabled_at,
    testOf: row.test_of,
    guestCode: row.role === "guest" ? row.guest_code : null,
  };
}

export const FEEDBACK_CATEGORIES = ["bug", "idee", "analyse", "donnees", "besoin", "autre"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const feedbackInputSchema = z.object({
  page: z.string().trim().min(1).max(200),
  category: z.enum(FEEDBACK_CATEGORIES),
  rating: z.union([z.literal(1), z.literal(-1)]).nullable(),
  subjectKind: z.enum(["session", "outlook", "chat", "page"]).nullable(),
  subjectId: z.string().max(200).nullable(),
  promptVersion: z.string().max(60).nullable(),
  note: z.string().trim().max(2000),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

const feedbackRowSchema = z.object({
  id: z.string(),
  profile_id: z.string(),
  created_at: z.string(),
  page: z.string(),
  category: z.enum(FEEDBACK_CATEGORIES),
  rating: z.number().nullable(),
  subject_kind: z.string().nullable(),
  subject_id: z.string().nullable(),
  prompt_version: z.string().nullable(),
  note: z.string(),
});

export type FeedbackRecord = {
  id: string;
  profileId: string;
  createdAt: string;
  page: string;
  category: FeedbackCategory;
  rating: 1 | -1 | null;
  subjectKind: string | null;
  subjectId: string | null;
  promptVersion: string | null;
  note: string;
};

function toFeedback(row: z.infer<typeof feedbackRowSchema>): FeedbackRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    createdAt: row.created_at,
    page: row.page,
    category: row.category,
    rating: row.rating === 1 ? 1 : row.rating === -1 ? -1 : null,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    promptVersion: row.prompt_version,
    note: row.note,
  };
}

export function migrateRegistry(connection: Database.Database): void {
  const current = connection.pragma("user_version", { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    connection.transaction(() => {
      connection.exec(MIGRATIONS[version]);
      connection.pragma(`user_version = ${version + 1}`);
    })();
  }
}

export function createRegistry(connection: Database.Database, clock: () => Date = () => new Date()) {
  migrateRegistry(connection);
  const nowIso = () => clock().toISOString();

  const getRow = (id: string): ProfileRow | null => {
    const raw: unknown = connection.prepare("SELECT * FROM profiles WHERE id = ?").get(id);
    return raw ? profileRowSchema.parse(raw) : null;
  };

  const registry = {
    /** L'administrateur existe toujours (Bastien, sur sa base historique). */
    ensureAdmin(name = "Bastien"): MemberRecord {
      const existing = getRow(ADMIN_ID);
      if (existing) return toRecord(existing);
      const now = nowIso();
      connection
        .prepare("INSERT INTO profiles (id, name, role, garmin_env_var, created_at, onboarded_at) VALUES (?, ?, 'admin', ?, ?, ?)")
        .run(ADMIN_ID, name, garminEnvVarFor(ADMIN_ID, "admin"), now, now);
      return toRecord(getRow(ADMIN_ID) as ProfileRow);
    },

    list(): MemberRecord[] {
      const rows = z.array(profileRowSchema).parse(connection.prepare("SELECT * FROM profiles ORDER BY role, created_at").all());
      return rows.map(toRecord);
    },

    find(id: string): MemberRecord | null {
      const row = getRow(id);
      return row ? toRecord(row) : null;
    },

    createGuest(input: { id: string; name: string; code: string; dailyTokenCap?: number | null; weeklyTokenCap?: number | null }): MemberRecord {
      if (!MEMBER_ID_PATTERN.test(input.id)) throw new Error("Identifiant de profil invalide");
      if (getRow(input.id)) throw new Error("Ce profil existe déjà");
      const { hash, salt } = hashCode(input.code);
      connection
        .prepare("INSERT INTO profiles (id, name, role, code_hash, code_salt, garmin_env_var, daily_token_cap, weekly_token_cap, created_at) VALUES (?, ?, 'guest', ?, ?, ?, ?, ?, ?)")
        .run(input.id, input.name, hash, salt, garminEnvVarFor(input.id, "guest"), input.dailyTokenCap === undefined ? DEFAULT_GUEST_DAILY_CAP : input.dailyTokenCap, input.weeklyTokenCap === undefined ? DEFAULT_GUEST_WEEKLY_CAP : input.weeklyTokenCap, nowIso());
      return toRecord(getRow(input.id) as ProfileRow);
    },

    /**
     * Profil invité de test : vu comme un invité (vouvoyé, plafonds, accueil), mais sur la
     * clé Garmin du profil copié et sans code (entrée par lien d'invitation).
     */
    createTestGuest(input: { id: string; name: string; testOf: string }): MemberRecord {
      if (!MEMBER_ID_PATTERN.test(input.id)) throw new Error("Identifiant de profil invalide");
      if (getRow(input.id)) throw new Error("Ce profil existe déjà");
      const source = getRow(input.testOf);
      if (!source) throw new Error("Profil copié introuvable");
      connection
        .prepare("INSERT INTO profiles (id, name, role, garmin_env_var, daily_token_cap, weekly_token_cap, created_at, test_of) VALUES (?, ?, 'guest', ?, ?, ?, ?, ?)")
        .run(input.id, input.name, source.garmin_env_var, DEFAULT_GUEST_DAILY_CAP, DEFAULT_GUEST_WEEKLY_CAP, nowIso(), input.testOf);
      return toRecord(getRow(input.id) as ProfileRow);
    },

    /**
     * Accueil du premier jour pour un invité : appareils déconnectés (il se reconnecte avec prénom et code),
     * page de bienvenue et mini-guide de nouveau affichés. Ni ses données ni ses analyses ne bougent.
     */
    resetOnboarding(id: string): void {
      const row = getRow(id);
      if (!row || row.role !== "guest") throw new Error("Seul un invité se réinitialise ainsi");
      connection.prepare("UPDATE profiles SET onboarded_at = NULL WHERE id = ?").run(id);
      registry.revokeAllSessions(id);
      registry.setSetting(`guide_reset_${id}`, nowIso());
    },

    /** Profil de test remis comme neuf : jamais connecté, accueil à revoir, appareils et invitations révoqués. */
    resetFirstVisit(id: string): void {
      const row = getRow(id);
      if (!row?.test_of) throw new Error("Seul un profil de test se réinitialise");
      connection.prepare("UPDATE profiles SET onboarded_at = NULL, last_login_at = NULL, disabled_at = NULL WHERE id = ?").run(id);
      registry.revokeAllSessions(id);
    },

    /** Nouveau code de secours (les appareils déjà connectés le restent ; les révoquer à part). */
    setCode(id: string, code: string): void {
      const { hash, salt } = hashCode(code);
      connection.prepare("UPDATE profiles SET code_hash = ?, code_salt = ? WHERE id = ?").run(hash, salt, id);
    },

    /** Code personnel court d'un invité : vérifié comme les autres (empreinte), gardé lisible pour Bastien. */
    setGuestCode(id: string, code: string): void {
      const { hash, salt } = hashCode(code);
      connection.prepare("UPDATE profiles SET code_hash = ?, code_salt = ?, guest_code = ? WHERE id = ? AND role = 'guest'").run(hash, salt, code, id);
    },

    /**
     * Connexion par prénom + code : le prénom est tapé (aucune liste de profils n'est montrée sur la page
     * publique). Plusieurs profils au même prénom (Bastien et son profil de test) : le code départage.
     */
    findByNameAndCode(name: string, code: string): MemberRecord | null {
      const wanted = normalizeName(name);
      if (!wanted) return null;
      for (const row of z.array(profileRowSchema).parse(connection.prepare("SELECT * FROM profiles WHERE disabled_at IS NULL AND code_hash IS NOT NULL").all())) {
        if (normalizeName(row.name) === wanted && row.code_hash && row.code_salt && verifyCode(code, row.code_hash, row.code_salt)) return toRecord(row);
      }
      return null;
    },

    /** Profil actif dont le code correspond (connexion par code seul : aucun nom de profil n'est exposé). */
    findByCode(code: string): MemberRecord | null {
      for (const row of z.array(profileRowSchema).parse(connection.prepare("SELECT * FROM profiles WHERE disabled_at IS NULL AND code_hash IS NOT NULL").all())) {
        if (row.code_hash && row.code_salt && verifyCode(code, row.code_hash, row.code_salt)) return toRecord(row);
      }
      return null;
    },

    setCaps(id: string, caps: { dailyTokenCap: number | null; weeklyTokenCap: number | null }): void {
      connection.prepare("UPDATE profiles SET daily_token_cap = ?, weekly_token_cap = ? WHERE id = ?").run(caps.dailyTokenCap, caps.weeklyTokenCap, id);
    },

    rename(id: string, name: string): void {
      connection.prepare("UPDATE profiles SET name = ? WHERE id = ?").run(name, id);
    },

    /** Désactiver un profil révoque aussi tous ses appareils et invitations. */
    setDisabled(id: string, disabled: boolean): void {
      if (id === ADMIN_ID) return;
      connection.prepare("UPDATE profiles SET disabled_at = ? WHERE id = ?").run(disabled ? nowIso() : null, id);
      if (disabled) registry.revokeAllSessions(id);
    },

    // --- Sessions par appareil ---

    createSession(profileId: string, token: string, device: string): void {
      const now = clock();
      connection
        .prepare("INSERT INTO sessions (id, profile_id, created_at, last_seen_at, expires_at, device) VALUES (?, ?, ?, ?, ?, ?)")
        .run(tokenDigest(token), profileId, now.toISOString(), now.toISOString(), new Date(now.getTime() + SESSION_TTL_S * 1000).toISOString(), device);
    },

    /** Profil d'un jeton de session valide (non révoqué, non expiré, profil actif), ou null. */
    resolveSession(token: string): MemberRecord | null {
      const raw: unknown = connection.prepare("SELECT profile_id, last_seen_at FROM sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?").get(tokenDigest(token), nowIso());
      const parsed = z.object({ profile_id: z.string(), last_seen_at: z.string() }).safeParse(raw);
      if (!parsed.success) return null;
      const record = registry.find(parsed.data.profile_id);
      if (!record || record.disabledAt) return null;
      // Dernière activité, mise à jour au plus toutes les 10 minutes.
      if (Date.parse(parsed.data.last_seen_at) < clock().getTime() - 10 * 60_000) connection.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), tokenDigest(token));
      return record;
    },

    endSession(token: string): void {
      connection.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(nowIso(), tokenDigest(token));
    },

    listSessions(profileId?: string): Array<{ id: string; profileId: string; createdAt: string; lastSeenAt: string; device: string }> {
      const rows = z.array(z.object({ id: z.string(), profile_id: z.string(), created_at: z.string(), last_seen_at: z.string(), device: z.string() }))
        .parse(connection.prepare(`SELECT id, profile_id, created_at, last_seen_at, device FROM sessions WHERE revoked_at IS NULL AND expires_at > ?${profileId ? " AND profile_id = ?" : ""} ORDER BY last_seen_at DESC`).all(...(profileId ? [nowIso(), profileId] : [nowIso()])));
      // L'identifiant exposé est un préfixe de l'empreinte : il sert à révoquer, pas à se connecter.
      return rows.map((row) => ({ id: row.id.slice(0, 16), profileId: row.profile_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, device: row.device }));
    },

    revokeSession(shortId: string): void {
      if (!/^[0-9a-f]{16}$/.test(shortId)) return;
      connection.prepare("UPDATE sessions SET revoked_at = ? WHERE substr(id, 1, 16) = ? AND revoked_at IS NULL").run(nowIso(), shortId);
    },

    revokeAllSessions(profileId: string): void {
      connection.prepare("UPDATE sessions SET revoked_at = ? WHERE profile_id = ? AND revoked_at IS NULL").run(nowIso(), profileId);
      connection.prepare("UPDATE invitations SET used_at = ? WHERE profile_id = ? AND used_at IS NULL").run(nowIso(), profileId);
    },

    // --- Invitations (lien personnel à usage unique) ---

    /** Une seule invitation valide par profil : la précédente est annulée. */
    createInvitation(profileId: string, token: string): { expiresAt: string } {
      const now = clock();
      const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
      connection.prepare("UPDATE invitations SET used_at = ? WHERE profile_id = ? AND used_at IS NULL").run(now.toISOString(), profileId);
      connection.prepare("INSERT INTO invitations (id, profile_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(tokenDigest(token), profileId, now.toISOString(), expiresAt);
      return { expiresAt };
    },

    /** Consomme l'invitation (une seule fois) et renvoie son profil, ou null. */
    consumeInvitation(token: string): MemberRecord | null {
      const now = nowIso();
      const result = connection.prepare("UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?").run(now, tokenDigest(token), now);
      if (result.changes !== 1) return null;
      const raw: unknown = connection.prepare("SELECT profile_id FROM invitations WHERE id = ?").get(tokenDigest(token));
      const parsed = z.object({ profile_id: z.string() }).safeParse(raw);
      const record = parsed.success ? registry.find(parsed.data.profile_id) : null;
      return record && !record.disabledAt ? record : null;
    },

    pendingInvitation(profileId: string): { expiresAt: string } | null {
      const raw: unknown = connection.prepare("SELECT expires_at FROM invitations WHERE profile_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1").get(profileId, nowIso());
      const parsed = z.object({ expires_at: z.string() }).safeParse(raw);
      return parsed.success ? { expiresAt: parsed.data.expires_at } : null;
    },

    // --- Journal des connexions ---

    logLogin(event: { profileId: string | null; method: "code" | "invitation"; outcome: "ok" | "refused" | "locked"; address: string | null; device: string }): void {
      connection.prepare("INSERT INTO login_events (id, at, profile_id, method, outcome, address, device) VALUES (?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), nowIso(), event.profileId, event.method, event.outcome, event.address, event.device);
      // Journal borné : 90 jours.
      connection.prepare("DELETE FROM login_events WHERE at < ?").run(new Date(clock().getTime() - 90 * 86_400_000).toISOString());
    },

    listLogins(limit = 50): Array<{ at: string; profileId: string | null; method: string; outcome: string; address: string | null; device: string }> {
      return z.array(z.object({ at: z.string(), profile_id: z.string().nullable(), method: z.string(), outcome: z.string(), address: z.string().nullable(), device: z.string() }))
        .parse(connection.prepare("SELECT at, profile_id, method, outcome, address, device FROM login_events ORDER BY at DESC LIMIT ?").all(limit))
        .map((row) => ({ at: row.at, profileId: row.profile_id, method: row.method, outcome: row.outcome, address: row.address, device: row.device }));
    },

    markLogin(id: string): void {
      connection.prepare("UPDATE profiles SET last_login_at = ? WHERE id = ?").run(nowIso(), id);
    },

    markOnboarded(id: string): void {
      connection.prepare("UPDATE profiles SET onboarded_at = COALESCE(onboarded_at, ?) WHERE id = ?").run(nowIso(), id);
    },

    getSetting<T>(key: string, schema: z.ZodType<T>): T | null {
      const raw: unknown = connection.prepare("SELECT value_json FROM settings WHERE key = ?").get(key);
      const parsed = z.object({ value_json: z.string() }).safeParse(raw);
      if (!parsed.success) return null;
      const value = schema.safeParse(JSON.parse(parsed.data.value_json));
      return value.success ? value.data : null;
    },

    setSetting(key: string, value: unknown): void {
      connection
        .prepare("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at")
        .run(key, JSON.stringify(value), nowIso());
    },

    addFeedback(profileId: string, input: FeedbackInput): FeedbackRecord {
      const id = randomUUID();
      connection
        .prepare("INSERT INTO feedback (id, profile_id, created_at, page, category, rating, subject_kind, subject_id, prompt_version, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, profileId, nowIso(), input.page, input.category, input.rating, input.subjectKind, input.subjectId, input.promptVersion, input.note);
      return registry.listFeedback({ profileId }).find((entry) => entry.id === id) as FeedbackRecord;
    },

    /** Un seul pouce par profil et par sujet : le dernier remplace le précédent. */
    rateSubject(profileId: string, input: FeedbackInput): FeedbackRecord {
      if (input.subjectKind && input.subjectId) {
        connection.prepare("DELETE FROM feedback WHERE profile_id = ? AND subject_kind = ? AND subject_id = ? AND rating IS NOT NULL").run(profileId, input.subjectKind, input.subjectId);
      }
      return registry.addFeedback(profileId, input);
    },

    ratingOf(profileId: string, subjectKind: string, subjectId: string): 1 | -1 | null {
      const raw: unknown = connection.prepare("SELECT rating FROM feedback WHERE profile_id = ? AND subject_kind = ? AND subject_id = ? AND rating IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(profileId, subjectKind, subjectId);
      const parsed = z.object({ rating: z.number() }).safeParse(raw);
      return parsed.success ? (parsed.data.rating === 1 ? 1 : -1) : null;
    },

    /** Filtre par profil obligatoire hors vue administrateur : `profileId` absent = tous. */
    listFeedback(filter: { profileId?: string; sinceIso?: string } = {}): FeedbackRecord[] {
      const clauses: string[] = [];
      const params: string[] = [];
      if (filter.profileId) { clauses.push("profile_id = ?"); params.push(filter.profileId); }
      if (filter.sinceIso) { clauses.push("created_at >= ?"); params.push(filter.sinceIso); }
      const sql = `SELECT * FROM feedback${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC`;
      return z.array(feedbackRowSchema).parse(connection.prepare(sql).all(...params)).map(toFeedback);
    },

    deleteFeedback(id: string): void {
      connection.prepare("DELETE FROM feedback WHERE id = ?").run(id);
    },
  };
  return registry;
}

export type Registry = ReturnType<typeof createRegistry>;
