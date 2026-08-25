import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { activityDetailsCache, activityStreamSummaries, athleteContextVersions, goals, manualSessions, syncedActivities, userConfirmations } from "./schema";

export type SyncedActivity = InferSelectModel<typeof syncedActivities>;
export type NewSyncedActivity = InferInsertModel<typeof syncedActivities>;
export type ManualSession = InferSelectModel<typeof manualSessions>;
export type NewManualSession = InferInsertModel<typeof manualSessions>;
export type Confirmation = InferSelectModel<typeof userConfirmations>;
export type NewConfirmation = InferInsertModel<typeof userConfirmations>;
export type AthleteContextVersion = InferSelectModel<typeof athleteContextVersions>;
export type NewAthleteContextVersion = InferInsertModel<typeof athleteContextVersions>;
export type Goal = InferSelectModel<typeof goals>;
export type NewGoal = InferInsertModel<typeof goals>;
export type ActivityDetailsCache = InferSelectModel<typeof activityDetailsCache>;
export type ActivityStreamSummary = InferSelectModel<typeof activityStreamSummaries>;