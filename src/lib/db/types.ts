import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { activities, activityDetails, appState, athleteContextVersions, coachOutputs, goals, wellnessDays } from "./schema";

export type ActivityRow = InferSelectModel<typeof activities>;
export type NewActivityRow = InferInsertModel<typeof activities>;
export type ActivityDetailRow = InferSelectModel<typeof activityDetails>;
export type WellnessRow = InferSelectModel<typeof wellnessDays>;
export type AppStateRow = InferSelectModel<typeof appState>;
export type CoachOutputRow = InferSelectModel<typeof coachOutputs>;
export type AthleteContextVersion = InferSelectModel<typeof athleteContextVersions>;
export type NewAthleteContextVersion = InferInsertModel<typeof athleteContextVersions>;
export type Goal = InferSelectModel<typeof goals>;
export type NewGoal = InferInsertModel<typeof goals>;
