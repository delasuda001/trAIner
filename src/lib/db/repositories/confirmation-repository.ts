import { eq } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { confirmationPayloadSchema, confirmationStatusSchema, confirmationTypeSchema, detectionConfidenceSchema, parseJson, serializeJson } from "../contracts";
import { userConfirmations } from "../schema";
import type { Confirmation, NewConfirmation } from "../types";

export function createConfirmationRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewConfirmation): Promise<Confirmation> { confirmationTypeSchema.parse(input.confirmationType); confirmationStatusSchema.parse(input.status); detectionConfidenceSchema.parse(input.detectionConfidence); const proposed = parseJson(confirmationPayloadSchema, input.proposedPayloadJson); const [row] = await database.insert(userConfirmations).values({ ...input, proposedPayloadJson: serializeJson(confirmationPayloadSchema, proposed) }).returning(); return row; },
    async findById(id: string): Promise<Confirmation | undefined> { return database.query.userConfirmations.findFirst({ where: eq(userConfirmations.id, id) }); },
    async resolve(id: string, status: "confirmed" | "dismissed", payload?: Record<string, unknown>): Promise<Confirmation | undefined> { const now = new Date().toISOString(); const [row] = await database.update(userConfirmations).set({ status, resolvedAt: now, resolvedPayloadJson: payload ? serializeJson(confirmationPayloadSchema, payload) : null, updatedAt: now }).where(eq(userConfirmations.id, id)).returning(); return row; },
  };
}