import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { ActivityDetail, ActivityStreams, ActivitySummary, Lap } from "@/lib/source/types";
import { getDb, type AppDatabase } from "../client";
import { activities, activityDetails } from "../schema";
import type { ActivityRow } from "../types";

export type DetailStatus = "pending" | "ready" | "failed" | "skipped";

export function activityId(source: string, sourceId: string): string {
  return `${source}:${sourceId}`;
}

export function createActivityRepository(database: AppDatabase = getDb()) {
  return {
    /** Insère ou met à jour le résumé ; conserve le statut de détail et les métriques déjà calculées. */
    upsertSummaries(source: string, summaries: ActivitySummary[], detailStatusFor: (summary: ActivitySummary) => DetailStatus, now = new Date().toISOString()): { inserted: string[] } {
      const inserted: string[] = [];
      database.transaction((tx) => {
        for (const summary of summaries) {
          const id = activityId(source, summary.sourceId);
          const values = {
            name: summary.name,
            sport: summary.sport,
            sourceType: summary.sourceType,
            startTimeUtc: summary.startTimeUtc,
            startTimeLocal: summary.startTimeLocal,
            localDate: summary.startTimeLocal.slice(0, 10),
            distanceM: summary.distanceM,
            movingTimeS: summary.movingTimeS,
            elapsedTimeS: summary.elapsedTimeS,
            elevationGainM: summary.elevationGainM,
            averageSpeedMps: summary.averageSpeedMps,
            averageHeartRateBpm: summary.averageHeartRateBpm,
            maxHeartRateBpm: summary.maxHeartRateBpm,
            averageCadenceSpm: summary.averageCadenceSpm,
            trainingLoad: summary.trainingLoad,
            aerobicTrainingEffect: summary.aerobicTrainingEffect,
            anaerobicTrainingEffect: summary.anaerobicTrainingEffect,
            trainingEffectLabel: summary.trainingEffectLabel,
            hrTimeInZonesJson: summary.hrTimeInZonesS ? JSON.stringify(summary.hrTimeInZonesS) : null,
            averageTemperatureC: summary.averageTemperatureC,
            lapCount: summary.lapCount,
            updatedAt: now,
          };
          const existing = tx.select({ id: activities.id }).from(activities).where(eq(activities.id, id)).get();
          if (existing) {
            tx.update(activities).set(values).where(eq(activities.id, id)).run();
          } else {
            tx.insert(activities).values({ id, source, sourceId: summary.sourceId, detailStatus: detailStatusFor(summary), createdAt: now, ...values }).run();
            inserted.push(id);
          }
        }
      });
      return { inserted };
    },

    latestStart(source: string): string | null {
      const row = database.select({ start: activities.startTimeUtc }).from(activities).where(eq(activities.source, source)).orderBy(desc(activities.startTimeUtc)).limit(1).get();
      return row?.start ?? null;
    },

    count(): number {
      return database.select({ id: activities.id }).from(activities).all().length;
    },

    findById(id: string): ActivityRow | undefined {
      return database.select().from(activities).where(eq(activities.id, id)).get();
    },

    /** Activités depuis `sinceUtc` (inclus), plus anciennes d'abord. */
    findSince(sinceUtc: string, sports?: string[]): ActivityRow[] {
      const conditions = [gte(activities.startTimeUtc, sinceUtc)];
      if (sports) conditions.push(inArray(activities.sport, sports));
      return database.select().from(activities).where(and(...conditions)).orderBy(asc(activities.startTimeUtc)).all();
    },

    findAll(sports?: string[]): ActivityRow[] {
      const query = database.select().from(activities);
      return (sports ? query.where(inArray(activities.sport, sports)) : query).orderBy(asc(activities.startTimeUtc)).all();
    },

    findRecent(limit: number): ActivityRow[] {
      return database.select().from(activities).orderBy(desc(activities.startTimeUtc)).limit(limit).all();
    },

    findBefore(startUtc: string, sports: string[]): ActivityRow[] {
      return database.select().from(activities).where(and(lt(activities.startTimeUtc, startUtc), inArray(activities.sport, sports))).orderBy(desc(activities.startTimeUtc)).all();
    },

    findPendingDetails(limit: number): ActivityRow[] {
      return database.select().from(activities).where(eq(activities.detailStatus, "pending")).orderBy(desc(activities.startTimeUtc)).limit(limit).all();
    },

    countPendingDetails(): number {
      return database.select({ id: activities.id }).from(activities).where(eq(activities.detailStatus, "pending")).all().length;
    },

    saveDetail(id: string, detail: ActivityDetail, now = new Date().toISOString()): void {
      database.transaction((tx) => {
        tx.insert(activityDetails)
          .values({ activityId: id, streamsJson: detail.streams ? JSON.stringify(detail.streams) : null, lapsJson: JSON.stringify(detail.laps), fetchedAt: now })
          .onConflictDoUpdate({ target: activityDetails.activityId, set: { streamsJson: detail.streams ? JSON.stringify(detail.streams) : null, lapsJson: JSON.stringify(detail.laps), fetchedAt: now } })
          .run();
        tx.update(activities).set({ detailStatus: "ready", metricsJson: null, metricsVersion: null, updatedAt: now }).where(eq(activities.id, id)).run();
      });
    },

    /** Repasse en « à télécharger » les détails déjà présents d'un sport depuis une date (ex. nouveau champ lu dans le FIT). */
    requeueDetails(sports: string[], sinceUtc: string): number {
      const rows = database.select({ id: activities.id }).from(activities).where(and(inArray(activities.sport, sports), eq(activities.detailStatus, "ready"), gte(activities.startTimeUtc, sinceUtc))).all();
      for (const row of rows) database.update(activities).set({ detailStatus: "pending" }).where(eq(activities.id, row.id)).run();
      return rows.length;
    },

    setDetailStatus(id: string, status: DetailStatus): void {
      database.update(activities).set({ detailStatus: status, updatedAt: new Date().toISOString() }).where(eq(activities.id, id)).run();
    },

    getDetail(id: string): { streams: ActivityStreams | null; laps: Lap[] } | null {
      const row = database.select().from(activityDetails).where(eq(activityDetails.activityId, id)).get();
      if (!row) return null;
      return { streams: row.streamsJson ? (JSON.parse(row.streamsJson) as ActivityStreams) : null, laps: JSON.parse(row.lapsJson) as Lap[] };
    },

    saveMetrics(id: string, metricsJson: string, version: number): void {
      database.update(activities).set({ metricsJson, metricsVersion: version }).where(eq(activities.id, id)).run();
    },
  };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
