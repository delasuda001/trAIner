import { NextResponse } from "next/server";
import { z } from "zod";
import { createChatRepository } from "@/lib/db/repositories/chat-repository";
import { apiAsMember } from "@/lib/profiles/request";
import { askCoach } from "@/lib/server/chat-service";

export const dynamic = "force-dynamic";

export function GET() {
  return apiAsMember(() => NextResponse.json({ messages: createChatRepository().list() }));
}

const questionSchema = z.object({ question: z.string().trim().min(2).max(800), activityId: z.string().max(120).nullish() });

export async function POST(request: Request) {
  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Question vide ou trop longue (800 caractères au plus)." }, { status: 400 });
  return apiAsMember(async () => NextResponse.json(await askCoach(parsed.data.question, parsed.data.activityId ?? null)));
}

export function DELETE() {
  return apiAsMember(() => {
    createChatRepository().clear();
    return NextResponse.json({ messages: [] });
  });
}
