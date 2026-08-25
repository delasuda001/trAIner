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
const boundedText = (max: number) => z.string().trim().max(max);
const activityKindSchema = z.enum(["running", "swimming", "strength_training", "mobility", "rest", "other"]);
const weeklyAvailabilitySchema = z.object({ activities: z.array(activityKindSchema).max(6), note: boundedText(300).optional(), flexible: z.boolean().default(false) }).strict();
export const athleteContextSchema = z.object({
  version: z.literal(1),
  athleteProfile: z.object({ experienceLevel: z.enum(["beginner", "intermediate", "confirmed", "advanced"]).optional(), notes: boundedText(500).optional() }).strict(),
  performanceReferences: z.array(z.object({ id: boundedText(80), label: boundedText(100), value: boundedText(100), source: boundedText(100).optional(), observedDate: localDateSchema.optional(), note: boundedText(300).optional() }).strict()).max(20),
  priorities: z.object({ primary: boundedText(200).optional(), secondary: z.array(boundedText(200)).max(10) }).strict(),
  weeklyTemplate: z.object({ monday: weeklyAvailabilitySchema.optional(), tuesday: weeklyAvailabilitySchema.optional(), wednesday: weeklyAvailabilitySchema.optional(), thursday: weeklyAvailabilitySchema.optional(), friday: weeklyAvailabilitySchema.optional(), saturday: weeklyAvailabilitySchema.optional(), sunday: weeklyAvailabilitySchema.optional() }).strict(),
  currentBlock: z.object({ title: boundedText(150).optional(), durationWeeks: z.number().int().min(1).max(52).optional(), priority: boundedText(200).optional(), description: boundedText(1000).optional(), personalRules: z.array(boundedText(200)).max(10).optional() }).strict().optional(),
  coachingPreferences: z.object({ wantsCriticalDataGroundedFeedback: z.boolean(), wantsTrainingScenariosToReview: z.boolean(), wantsSourcesAndLimitationsAlwaysVisible: z.boolean() }).strict(),
}).strict();
export const goalDefinitionSchema = z.record(z.string(), z.unknown());
export const goalTypeSchema = z.enum(["general", "race", "performance", "process", "technical_observation"]);
export const goalInputSchema = z.object({ title: boundedText(150).min(1), type: goalTypeSchema, priority: goalPrioritySchema, status: z.enum(["active", "paused"]).default("active"), startDate: localDateSchema.optional(), targetDate: localDateSchema.optional(), targetValue: z.number().finite().optional(), targetUnit: boundedText(50).optional(), description: boundedText(1000).optional(), definition: goalDefinitionSchema.default({}) }).strict();

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
export type AthleteContextV1 = z.infer<typeof athleteContextSchema>;
export type AthleteContext = AthleteContextV1;
export type GoalInput = z.infer<typeof goalInputSchema>;
export type GoalDefinition = z.infer<typeof goalDefinitionSchema>;

export function serializeJson<T>(schema: z.ZodType<T>, value: T): string {
  return JSON.stringify(schema.parse(value));
}

export function parseJson<T>(schema: z.ZodType<T>, value: string): T {
  return schema.parse(JSON.parse(value) as unknown);
}