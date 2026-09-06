import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { createConversationRepository } from "@/lib/db/repositories/conversation-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = createConversationRepository(getDb());
  const thread = await repository.findThread(id);
  if (!thread) return NextResponse.json({ error: { code: "THREAD_NOT_FOUND", message: "Conversation introuvable", requestId: randomUUID() } }, { status: 404 });
  return NextResponse.json({ thread, messages: await repository.listMessages(id) });
}