import { db } from "../db";
import { cronSchedules, jobs } from "../db/schema";
import { eq, lte, and, inArray } from "drizzle-orm";
import { Cron } from "croner";
import { logger } from "../logger";
import { CronSchedulerError } from "../errors";

export interface DefaultSchedule {
  name: string;
  cronExpression: string;
  triggerMethod: string;
  payload: {
    [key: string]: string | number;
  };
}

export type CronScheduleSelect = typeof cronSchedules.$inferSelect;
export type CronScheduleInsert = typeof cronSchedules.$inferInsert;
export type JobInsert = typeof jobs.$inferInsert;
export type CronScheduleUpdateQuery = ReturnType<ReturnType<ReturnType<typeof db.update<typeof cronSchedules>>["set"]>["where"]>;

/**
 * Calculates the next execution time for a cron expression.
 */
export function getNextCronRun(cronExpression: string, fromDate: Date = new Date()): Date {
  const c: Cron = new Cron(cronExpression);
  const nextDate: Date | null = c.nextRun(fromDate);
  if (!nextDate) throw new CronSchedulerError(`Invalid cron expression: "${cronExpression}"`);
  return nextDate;
}

/**
 * Seed the required cron schedules for Geonera Ingestion into the database.
 */
export async function seedSchedules(): Promise<void> {
  const defaultSchedules: Array<DefaultSchedule> = [
    {
      name: "maintenance",
      cronExpression: "*/5 * * * *",
      triggerMethod: "RABBITMQ",
      payload: { queue: "jobs.maintenance" },
    },
    {
      name: "sync",
      cronExpression: "1,6,11,16,21,26,31,36,41,46,51,56 * * * *",
      triggerMethod: "RABBITMQ",
      payload: { queue: "jobs.sync" },
    },
    {
      name: "ticks-regular",
      cronExpression: "2 * * * *",
      triggerMethod: "RABBITMQ",
      payload: { queue: "jobs.ticks.regular" },
    },
    {
      name: "ticks-backfill",
      cronExpression: "3,13,23,33,43,53 * * * *",
      triggerMethod: "RABBITMQ",
      payload: { queue: "jobs.ticks.backfill" },
    },
    {
      name: "candles-backfill",
      cronExpression: "4,24,44 * * * *",
      triggerMethod: "RABBITMQ",
      payload: { queue: "jobs.candles.backfill" },
    },
    {
      name: "candles-regular",
      cronExpression: "8 5 * * *",
      triggerMethod: "RABBITMQ",
      payload: { queue: "jobs.candles.regular" },
    },
    {
      name: "cleanup-jobs",
      cronExpression: "0 0 * * *",
      triggerMethod: "INTERNAL",
      payload: { retentionDays: 7 },
    },
  ];

  logger.info("[Seeder] Checking and seeding default cron schedules...");
  const defaultNames: string[] = defaultSchedules.map((s: DefaultSchedule): string => s.name);
  const existingSchedules: Array<CronScheduleSelect> = await db.select().from(cronSchedules).where(inArray(cronSchedules.name, defaultNames));

  const existingMap: Map<string, CronScheduleSelect> = new Map<string, CronScheduleSelect>(
    existingSchedules.map((s: CronScheduleSelect): [string, CronScheduleSelect] => [s.name, s]),
  );

  const toInsert: Array<CronScheduleInsert> = [];
  const toUpdate: Array<CronScheduleUpdateQuery> = [];

  for (const item of defaultSchedules) {
    const existing: CronScheduleSelect | undefined = existingMap.get(item.name);

    if (!existing) {
      logger.info({ name: item.name, cronExpression: item.cronExpression }, "[Seeder] Seeding schedule");
      const nextRunAt: Date = getNextCronRun(item.cronExpression);
      toInsert.push({
        name: item.name,
        cronExpression: item.cronExpression,
        triggerMethod: item.triggerMethod,
        payload: item.payload,
        nextRunAt,
      });
    } else {
      // If config changed in code, update it to keep DB state in sync
      if (existing.cronExpression !== item.cronExpression || existing.triggerMethod !== item.triggerMethod) {
        logger.info({ name: item.name }, "[Seeder] Updating schedule configuration");
        const nextRunAt: Date = getNextCronRun(item.cronExpression);
        toUpdate.push(
          db
            .update(cronSchedules)
            .set({
              cronExpression: item.cronExpression,
              triggerMethod: item.triggerMethod,
              payload: item.payload,
              nextRunAt,
              updatedAt: new Date(),
            })
            .where(eq(cronSchedules.name, item.name)),
        );
      }
    }
  }

  if (toInsert.length > 0) await db.insert(cronSchedules).values(toInsert);
  if (toUpdate.length > 0) await Promise.all(toUpdate);

  logger.info("[Seeder] Seeding completed.");
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Periodically run by the scheduler manager to identify schedules due for running.
 * Uses SELECT FOR UPDATE to prevent double-firing when multiple scheduler nodes run concurrently.
 */
export async function tickCronScheduler(): Promise<void> {
  const now: Date = new Date();

  try {
    await db.transaction(async (tx: DbTransaction): Promise<void> => {
      // Lock active schedules that are due
      const schedulesToRun: Array<CronScheduleSelect> = await tx
        .select()
        .from(cronSchedules)
        .where(and(eq(cronSchedules.isActive, true), lte(cronSchedules.nextRunAt, now)))
        .for("update")
        .execute();

      if (schedulesToRun.length === 0) return;

      const scheduleNames: string[] = schedulesToRun.map((s: CronScheduleSelect): string => s.name);

      // Check which schedules already have pending jobs to prevent overlap
      const pendingJobs: Array<{ name: string }> = await tx
        .select({ name: jobs.name })
        .from(jobs)
        .where(and(inArray(jobs.name, scheduleNames), eq(jobs.status, "pending")));

      const pendingNamesSet: Set<string> = new Set<string>(pendingJobs.map((j: { name: string }): string => j.name));
      const jobsToInsert: Array<JobInsert> = [];
      const cronUpdates: Array<Promise<unknown>> = [];

      for (const sched of schedulesToRun) {
        logger.info({ name: sched.name }, "[Cron] Schedule is due. Enqueueing job...");

        if (pendingNamesSet.has(sched.name)) logger.warn({ name: sched.name }, "[Cron] Overlap prevented: job instance is already pending.");
        else
          jobsToInsert.push({
            name: sched.name,
            triggerMethod: sched.triggerMethod,
            payload: sched.payload,
            scheduledAt: sched.nextRunAt,
            status: "pending",
          });

        // Calculate next run time from the scheduled date to prevent grid drift
        const nextRunAt: Date = getNextCronRun(sched.cronExpression, sched.nextRunAt);

        // Update cron schedule state
        cronUpdates.push(tx.update(cronSchedules).set({ nextRunAt, updatedAt: new Date() }).where(eq(cronSchedules.id, sched.id)));
      }

      if (cronUpdates.length > 0) await Promise.all(cronUpdates);
      if (jobsToInsert.length > 0) {
        const inserted: Array<{ id: string; name: string }> = await tx.insert(jobs).values(jobsToInsert).returning({ id: jobs.id, name: jobs.name });
        for (const job of inserted) logger.info({ name: job.name, jobId: job.id, traceId: job.id }, "[Cron] Successfully enqueued job for execution.");
      }
    });
  } catch (error: unknown) {
    const errorMsg: string = error instanceof Error ? error.message : String(error);
    logger.error(new CronSchedulerError("Error ticketing cron scheduler", { originalError: errorMsg }), "[Cron] Error ticketing cron scheduler");
  }
}
