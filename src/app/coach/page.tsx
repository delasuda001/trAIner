import { CoachChat } from "@/components/coach/coach-chat";
import { createChatRepository } from "@/lib/db/repositories/chat-repository";

export const dynamic = "force-dynamic";

export default function CoachPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Coach</p>
          <h1 className="page-title">Demander au coach</h1>
          <p className="page-sub">Il répond à partir de ton objectif, de ta charge, de ta progression, de tes dernières séances et de ton ressenti. Jamais de chiffre inventé.</p>
        </div>
      </div>
      <CoachChat initial={createChatRepository().list()} />
    </>
  );
}
