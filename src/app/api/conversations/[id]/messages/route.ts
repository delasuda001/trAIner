import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { createConversationRepository } from "@/lib/db/repositories/conversation-repository";
import { buildConversationContext } from "@/lib/llm/conversation-context";
import { GeminiAnalysisClient } from "@/lib/llm/gemini-client";

const inputSchema = z.object({ question: z.string().trim().min(1).max(4000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = randomUUID();
  try {
    const { question } = inputSchema.parse(await request.json());
    const database = getDb();
    const repository = createConversationRepository(database);
    if (!(await repository.findThread(id))) return NextResponse.json({ error: { code: "THREAD_NOT_FOUND", message: "Conversation introuvable", requestId } }, { status: 404 });
    const previousMessages = await repository.listMessages(id);
    await repository.addMessage({ id: randomUUID(), threadId: id, role: "user", contentJson: question, createdAt: new Date().toISOString() });
    const context = await buildConversationContext(question, database, previousMessages);
    const generated = await new GeminiAnalysisClient().analyzeConversation(context);
    const assistant = await repository.addMessage({ id: randomUUID(), threadId: id, role: "assistant", contentJson: JSON.stringify(generated.response), createdAt: new Date().toISOString() });
    return NextResponse.json({ threadId: id, messageId: assistant.id, response: generated.response, scope: context.scope, model: generated.model }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "La question est invalide", requestId } }, { status: 400 });
    console.error("[conversations] message error", { requestId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: { code: "CONVERSATION_FAILED", message: error instanceof Error ? error.message : "La réponse n’a pas pu être générée", requestId } }, { status: 500 });
  }
}