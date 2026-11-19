import { randomUUID } from "node:crypto";
import { asc, desc } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { coachChatMessages } from "../schema";

export type ChatMessage = { id: string; role: "user" | "coach"; content: { text: string; evidence?: string[]; error?: boolean; activity?: { id: string; label: string } }; model: string | null; createdAt: string };

function parse(row: typeof coachChatMessages.$inferSelect): ChatMessage {
  return { id: row.id, role: row.role === "coach" ? "coach" : "user", content: JSON.parse(row.contentJson) as ChatMessage["content"], model: row.model, createdAt: row.createdAt };
}

export function createChatRepository(database: AppDatabase = getDb()) {
  return {
    list(limit = 50): ChatMessage[] {
      return database.select().from(coachChatMessages).orderBy(desc(coachChatMessages.createdAt)).limit(limit).all().reverse().map(parse);
    },
    add(role: ChatMessage["role"], content: ChatMessage["content"], model: string | null = null): ChatMessage {
      const row = { id: randomUUID(), role, contentJson: JSON.stringify(content), model, createdAt: new Date().toISOString() };
      database.insert(coachChatMessages).values(row).run();
      return parse(row);
    },
    clear(): void {
      database.delete(coachChatMessages).run();
    },
    all(): ChatMessage[] {
      return database.select().from(coachChatMessages).orderBy(asc(coachChatMessages.createdAt)).all().map(parse);
    },
  };
}
