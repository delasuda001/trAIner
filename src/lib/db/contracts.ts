import { z } from "zod";

export const manualDisciplineSchema = z.enum(["strength_training", "swimming", "mobility", "other"]);
export const confirmationTypeSchema = z.enum(["performance_test_candidate", "cadence_drill_candidate", "session_intent_missing", "data_quality_review"]);
export const confirmationStatusSchema = z.enum(["detected", "confirmed", "dismissed"]);
export const detectionConfidenceSchema = z.enum(["low", "medium", "high"]);
export const contextStatusSchema = z.enum(["draft", "active", "archived"]);
export const goalPrioritySchema = z.enum(["primary", "secondary"]);
export const goalStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit respecter YYYY-MM-DD").refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "La date est invalide");
export const manualSessionInputSchema = z.object({
  sessionDate: localDateSchema,
  discipline: manualDisciplineSchema,
  durationMinutes: z.number().int().positive().max(720),
  label: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});

export const confirmationPayloadSchema = z.record(z.string(), z.unknown());
export const activityDetailCacheSchema = z.object({ id: z.string(), name: z.string().optional(), sportType: z.string().optional() }).strict();
export const streamSummarySchema = z.object({ version: z.string(), metrics: z.record(z.string(), z.number().finite()) }).strict();
export const athleteContextSchema = z.object({ goals: z.array(z.string()).default([]), weekTemplate: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), label: z.string() }).strict()).default([]), notes: z.string().optional() }).strict();
export const goalDefinitionSchema = z.record(z.string(), z.unknown());

export type ManualDiscipline = z.infer<typeof manualDisciplineSchema>;
export type ConfirmationType = z.infer<typeof confirmationTypeSchema>;
export type ConfirmationStatus = z.infer<typeof confirmationStatusSchema>;
export type DetectionConfidence = z.infer<typeof detectionConfidenceSchema>;
export type ContextStatus = z.infer<typeof contextStatusSchema>;
export type GoalPriority = z.infer<typeof goalPrioritySchema>;
export type GoalStatus = z.infer<typeof goalStatusSchema>;
export type ConfirmationPayload = z.infer<typeof confirmationPayloadSchema>;
export type ActivityDetailCache = z.infer<typeof activityDetailCacheSchema>;
export type StreamSummary = z.infer<typeof streamSummarySchema>;
export type AthleteContext = z.infer<typeof athleteContextSchema>;
export type GoalDefinition = z.infer<typeof goalDefinitionSchema>;

export function serializeJson<T>(schema: z.ZodType<T>, value: T): string {
  return JSON.stringify(schema.parse(value));
}

export function parseJson<T>(schema: z.ZodType<T>, value: string): T {
  return schema.parse(JSON.parse(value) as unknown);
}