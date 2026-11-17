import { z } from "zod";

/**
 * File d'attente des demandes au coach faites pendant que Sillage est injoignable
 * (Mac de Bastien éteint). Gardée sur l'appareil (localStorage), montrée en clair à
 * l'invité, envoyée dans l'ordre au retour du Mac, sous les mêmes plafonds.
 */
export const QUEUE_STORAGE_KEY = "sillage_coach_queue";
export const QUEUE_MAX = 10;

const requestItem = z.object({ id: z.string(), kind: z.literal("request"), endpoint: z.string().startsWith("/api/"), label: z.string(), createdAt: z.string() });
const chatItem = z.object({ id: z.string(), kind: z.literal("chat"), question: z.string().min(2).max(800), createdAt: z.string() });
export const queueItemSchema = z.discriminatedUnion("kind", [requestItem, chatItem]);
export type QueueItem = z.infer<typeof queueItemSchema>;
export type NewQueueItem = Omit<z.infer<typeof requestItem>, "id" | "createdAt"> | Omit<z.infer<typeof chatItem>, "id" | "createdAt">;

export function parseQueue(raw: string | null): QueueItem[] {
  if (!raw) return [];
  try {
    const parsed = z.array(queueItemSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Ajoute une demande ; une même analyse n'est mise en file qu'une fois. Refus au-delà de QUEUE_MAX. */
export function enqueue(queue: QueueItem[], item: NewQueueItem, now: Date, id: string): { queue: QueueItem[]; added: boolean } {
  if (item.kind === "request" && queue.some((entry) => entry.kind === "request" && entry.endpoint === item.endpoint)) return { queue, added: false };
  if (queue.length >= QUEUE_MAX) return { queue, added: false };
  return { queue: [...queue, { ...item, id, createdAt: now.toISOString() } as QueueItem], added: true };
}

export function removeFromQueue(queue: QueueItem[], id: string): QueueItem[] {
  return queue.filter((entry) => entry.id !== id);
}

/** Ce que l'invité lit : ce qui partira au retour du Mac. */
export function describeQueueItem(item: QueueItem): string {
  if (item.kind === "chat") return `Question : « ${item.question.length > 90 ? `${item.question.slice(0, 89)}…` : item.question} »`;
  return item.label;
}

/** Requête à envoyer au retour du Mac. */
export function requestFor(item: QueueItem): { url: string; init: { method: "POST"; headers?: Record<string, string>; body?: string } } {
  if (item.kind === "chat") return { url: "/api/coach/chat", init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: item.question }) } };
  return { url: item.endpoint, init: { method: "POST" } };
}

/** Une réponse HTTP prouve-t-elle que Sillage répond ? (le relais du tunnel renvoie 502/503/504 quand le Mac est éteint) */
export function reachable(status: number): boolean {
  return status > 0 && status < 502;
}
