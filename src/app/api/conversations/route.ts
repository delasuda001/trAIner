import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { createConversationRepository } from "@/lib/db/repositories/conversation-repository";
import { buildConversationContext } from "@/lib/llm/conversation-context";
import { GeminiAnalysisClient } from "@/lib/llm/gemini-client";
import { conversationResponseSchema } from "@/lib/llm/schemas";

const inputSchema = z.object({ question: z.string().trim().min(1).max(4000) });

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const { question } = inputSchema.parse(await request.json());
    const database = getDb();
    const repository = createConversationRepository(database);
    const now = new Date().toISOString();
    const threadId = randomUUID();
    await repository.createThread({ id: threadId, title: question.slice(0, 120), goalId: null, createdAt: now, updatedAt: now });
    await repository.addMessage({ id: randomUUID(), threadId, role: "user", contentJson: question, createdAt: now });
    const context = await buildConversationContext(question, database);
    const generated = await new GeminiAnalysisClient().analyzeConversation(context);
    const responseContent = conversationResponseSchema.parse(generated.response);
    const assistantMessage = await repository.addMessage({ id: randomUUID(), threadId, role: "assistant", contentJson: JSON.stringify(responseContent), createdAt: new Date().toISOString() });
    return NextResponse.json({ threadId, messageId: assistantMessage.id, response: responseContent, scope: context.scope, model: generated.model }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "La question est invalide", requestId } }, { status: 400 });
    console.error("[conversations] create error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: { code: "CONVERSATION_FAILED", message: error instanceof Error ? error.message : "La réponse n’a pas pu être générée", requestId } }, { status: 500 });
  }
}