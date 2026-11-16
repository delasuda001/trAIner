import { NextResponse } from "next/server";
import { z } from "zod";
import { createChatRepository } from "@/lib/db/repositories/chat-repository";
import { askCoach } from "@/lib/server/chat-service";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ messages: createChatRepository().list() });
}

const questionSchema = z.object({ question: z.string().trim().min(2).max(800) });

export async function POST(request: Request) {
  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Question vide ou trop longue (800 caractères au plus)." }, { status: 400 });
  return NextResponse.json(await askCoach(parsed.data.question));
}

export function DELETE() {
  createChatRepository().clear();
  return NextResponse.json({ messages: [] });
}
