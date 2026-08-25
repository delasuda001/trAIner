import { z } from "zod";

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

export const activitySchema = z.object({
  id: z.string(),
  name: z.string().optional().default("Course à pied"),
  type: z.string().optional().default("Run"),
  start_date_local: z.string().optional(),
  start_date: z.string().optional(),
  distance: nullableNumber,
  moving_time: nullableNumber,
  elapsed_time: nullableNumber,
  average_speed: nullableNumber,
  average_heartrate: nullableNumber,
  average_cadence: nullableNumber,
  total_elevation_gain: nullableNumber,
  temperature: nullableNumber,
  icu_training_load: nullableNumber,
});

export const activitiesSchema = z.array(activitySchema);

export const activityListItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.string().nullable().optional(),
  start_date: z.string().datetime({ offset: true }),
  start_date_local: z.string().optional(),
  timezone: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  distance: nullableNumber,
  moving_time: nullableNumber,
  elapsed_time: nullableNumber,
  average_speed: nullableNumber,
  average_heartrate: nullableNumber,
  max_heartrate: nullableNumber,
  average_cadence: nullableNumber,
  icu_average_watts: nullableNumber,
  total_elevation_gain: nullableNumber,
  icu_training_load: nullableNumber,
  icu_sync_date: z.string().datetime({ offset: true }).nullable().optional(),
});

export const activitiesListEnvelopeSchema = z.array(z.unknown());

export const lapSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: nullableString,
  distance: nullableNumber,
  elapsed_time: nullableNumber,
  moving_time: nullableNumber,
  average_speed: nullableNumber,
  average_heartrate: nullableNumber,
  average_cadence: nullableNumber,
  recovery_time: nullableNumber,
});

export const lapsSchema = z.array(lapSchema);

const intervalSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  label: z.string().nullable().optional(),
  distance: nullableNumber,
  elapsed_time: nullableNumber,
  moving_time: nullableNumber,
  average_speed: nullableNumber,
  average_heartrate: nullableNumber,
  average_cadence: nullableNumber,
  type: z.string().nullable().optional(),
});

export const intervalsSchema = z.object({
  id: z.string().optional(),
  analyzed: z.string().optional(),
  icu_intervals: z.array(intervalSchema).optional().default([]),
  icu_groups: z.array(z.unknown()).optional(),
});

export type Interval = z.infer<typeof intervalSchema>;
export type IntervalsResponse = z.infer<typeof intervalsSchema>;

export type Activity = z.infer<typeof activitySchema>;
export type ActivityListItem = z.infer<typeof activityListItemSchema>;
export type Lap = z.infer<typeof lapSchema>;