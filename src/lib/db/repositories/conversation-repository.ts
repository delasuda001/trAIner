import { asc, eq } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { conversationMessages, conversationThreads } from "../schema";
import type { ConversationMessage, ConversationThread, NewConversationMessage, NewConversationThread } from "../types";

export function createConversationRepository(database: AppDatabase = getDb()) {
  return {
    async createThread(input: NewConversationThread): Promise<ConversationThread> {
      const [thread] = await database.insert(conversationThreads).values(input).returning();
      return thread;
    },
    async findThread(id: string): Promise<ConversationThread | undefined> {
      return database.query.conversationThreads.findFirst({ where: eq(conversationThreads.id, id) });
    },
    async addMessage(input: NewConversationMessage): Promise<ConversationMessage> {
      const [message] = await database.insert(conversationMessages).values(input).returning();
      return message;
    },
    async listMessages(threadId: string): Promise<ConversationMessage[]> {
      return database.select().from(conversationMessages).where(eq(conversationMessages.threadId, threadId)).orderBy(asc(conversationMessages.createdAt));
    },
  };
}