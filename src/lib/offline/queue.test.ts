import { describe, expect, it } from "vitest";
import { describeQueueItem, enqueue, parseQueue, QUEUE_MAX, reachable, removeFromQueue, requestFor, type QueueItem } from "./queue";

const now = new Date("2026-11-17T18:00:00Z");

describe("file d'attente du coach hors ligne", () => {
  it("ajoute, décrit, retire", () => {
    let queue: QueueItem[] = [];
    queue = enqueue(queue, { kind: "chat", question: "Puis-je courir deux jours de suite ?" }, now, "a").queue;
    queue = enqueue(queue, { kind: "request", endpoint: "/api/activities/garmin%3A1/coach", label: "Analyse de la séance du 12 nov." }, now, "b").queue;
    expect(queue.map(describeQueueItem)).toEqual(["Question : « Puis-je courir deux jours de suite ? »", "Analyse de la séance du 12 nov."]);
    expect(requestFor(queue[0])).toEqual({ url: "/api/coach/chat", init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "Puis-je courir deux jours de suite ?" }) } });
    expect(requestFor(queue[1]).url).toBe("/api/activities/garmin%3A1/coach");
    expect(removeFromQueue(queue, "a").map((item) => item.id)).toEqual(["b"]);
  });

  it("ne met une même analyse en file qu'une fois et plafonne la file", () => {
    const item = { kind: "request" as const, endpoint: "/api/coach/outlook", label: "Conseil du jour" };
    const first = enqueue([], item, now, "a");
    expect(enqueue(first.queue, item, now, "b").added).toBe(false);
    let queue: QueueItem[] = [];
    for (let index = 0; index < QUEUE_MAX + 2; index += 1) queue = enqueue(queue, { kind: "chat", question: `Question ${index}` }, now, String(index)).queue;
    expect(queue).toHaveLength(QUEUE_MAX);
  });

  it("relit une file stockée, en ignorant ce qui est invalide", () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue("pas du json")).toEqual([]);
    expect(parseQueue(JSON.stringify([{ id: "x", kind: "request", endpoint: "https://ailleurs.example", label: "x", createdAt: "" }]))).toEqual([]);
    const stored = [{ id: "a", kind: "chat", question: "Une question", createdAt: now.toISOString() }];
    expect(parseQueue(JSON.stringify(stored))).toEqual(stored);
  });

  it("distingue Sillage injoignable (relais du tunnel en erreur) d'une simple session expirée", () => {
    expect(reachable(200)).toBe(true);
    expect(reachable(401)).toBe(true);
    expect(reachable(502)).toBe(false);
    expect(reachable(504)).toBe(false);
    expect(reachable(0)).toBe(false);
  });
});
