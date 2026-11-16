import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { createConversationRepository } from "@/lib/db/repositories/conversation-repository";
import { buildActivityLookup, extractEvidenceActivityIds, parseStoredConversationEvidence } from "@/lib/llm/evidence-labels";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const database = getDb();
  const repository = createConversationRepository(database);
  const thread = await repository.findThread(id);
  if (!thread) return NextResponse.json({ error: { code: "THREAD_NOT_FOUND", message: "Conversation introuvable", requestId: randomUUID() } }, { status: 404 });
  const messages = await repository.listMessages(id);
  const evidenceIds = extractEvidenceActivityIds(
    messages.filter((message) => message.role === "assistant").map((message) => ({ evidence: parseStoredConversationEvidence(message.contentJson) }))
  );
  const activityLookup = await buildActivityLookup(database, evidenceIds);
  return NextResponse.json({ thread, messages, activityLookup });
}