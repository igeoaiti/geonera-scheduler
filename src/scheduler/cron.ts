import { db } from "../db";
import { cronSchedules, jobs } from "../db/schema";
import { eq, lte, and } from "drizzle-orm";
import { Cron } from "croner";
import { logger } from "../logger";
import { CronSchedulerError } from "../errors";

/**
 * Calculates the next execution time for a cron expression.
 */
export function getNextCronRun(cronExpression: string, fromDate: Date = new Date()): Date {
  const c: Cron = new Cron(cronExpression);
  const nextDate: Date | null = c.nextRun(fromDate);
  if (!nextDate) {
    throw new CronSchedulerError(`Invalid cron expression: "${cronExpression}"`);
  }
  return nextDate;
}

/**
 * Seed the required cron schedules for Geonera Ingestion into the database.
 */
export async function seedSchedules(): Promise<void> {
  const defaultSchedules: Array<{ name: string; cronExpression: string; triggerMethod: string; payload: any }> = [
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
  for (const item of defaultSchedules) {
    const existing: typeof cronSchedules.$inferSelect | undefined = await db.query.cronSchedules.findFirst({
      where: eq(cronSchedules.name, item.name),
    });

    if (!existing) {
      logger.info({ name: item.name, cronExpression: item.cronExpression }, "[Seeder] Seeding schedule");
      const nextRunAt: Date = getNextCronRun(item.cronExpression);
      await db.insert(cronSchedules).values({
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
        await db
          .update(cronSchedules)
          .set({
            cronExpression: item.cronExpression,
            triggerMethod: item.triggerMethod,
            payload: item.payload,
            nextRunAt,
            updatedAt: new Date(),
          })
          .where(eq(cronSchedules.name, item.name));
      }
    }
  }
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
      const schedulesToRun: Array<typeof cronSchedules.$inferSelect> = await tx
        .select()
        .from(cronSchedules)
        .where(
          and(
            eq(cronSchedules.isActive, true),
            lte(cronSchedules.nextRunAt, now)
          )
        )
        .for("update")
        .execute();

      for (const sched of schedulesToRun) {
        logger.info({ name: sched.name }, "[Cron] Schedule is due. Enqueueing job...");

        // Check if an identical job is already pending to avoid overlap
        const existingPending: typeof jobs.$inferSelect | undefined = await tx.query.jobs.findFirst({
          where: and(
            eq(jobs.name, sched.name),
            eq(jobs.status, "pending")
          )
        });

        if (existingPending) {
          logger.warn({ name: sched.name }, "[Cron] Overlap prevented: job instance is already pending.");
        } else {
          // Create the execution instance in `jobs`
          const inserted = await tx.insert(jobs).values({
            name: sched.name,
            triggerMethod: sched.triggerMethod,
            payload: sched.payload,
            scheduledAt: sched.nextRunAt,
            status: "pending",
          }).returning({ id: jobs.id });
          const jobId = inserted[0]?.id;
          logger.info({ name: sched.name, jobId, traceId: jobId }, "[Cron] Successfully enqueued job for execution.");
        }

        // Calculate next run time from the scheduled date to prevent grid drift
        const nextRunAt: Date = getNextCronRun(sched.cronExpression, sched.nextRunAt);

        // Update cron schedule state
        await tx
          .update(cronSchedules)
          .set({
            nextRunAt,
            updatedAt: new Date(),
          })
          .where(eq(cronSchedules.id, sched.id));
      }
    });
  } catch (error: unknown) {
    const errorMsg: string = error instanceof Error ? error.message : String(error);
    logger.error(new CronSchedulerError("Error ticketing cron scheduler", { originalError: errorMsg }), "[Cron] Error ticketing cron scheduler");
  }
}
