import { db } from "../db";
import { jobs } from "../db/schema";
import { eq, lte, and, desc, asc } from "drizzle-orm";
import { executeJob } from "./jobs";
import { logger } from "../logger";
import { DatabaseError, JobExecutionError, SchedulerError } from "../errors";
import pino from "pino";

let running: boolean = false;
let timeoutId: Timer | null = null;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Polls the database for a single pending job and executes it.
 * Uses SELECT FOR UPDATE SKIP LOCKED for high-concurrency safe execution.
 * Returns true if a job was found and processed, false otherwise.
 */
export async function pollAndRunJob(): Promise<boolean> {
  let jobToRun: typeof jobs.$inferSelect | null = null;

  try {
    // Phase 1: Claim the job atomically
    jobToRun = await db.transaction(async (tx: DbTransaction): Promise<typeof jobs.$inferSelect | null> => {
      const claimed: (typeof jobs.$inferSelect)[] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "pending"), lte(jobs.scheduledAt, new Date())))
        .orderBy(desc(jobs.priority), asc(jobs.scheduledAt))
        .limit(1)
        .for("update", { skipLocked: true })
        .execute();

      if (claimed.length > 0) {
        const job: typeof jobs.$inferSelect = claimed[0];
        // Mark job as running
        await tx
          .update(jobs)
          .set({
            status: "running",
            startedAt: new Date(),
            attempts: job.attempts + 1,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, job.id));
        return job;
      }
      return null;
    });
  } catch (error: unknown) {
    const errorMsg: string = error instanceof Error ? error.message : String(error);
    const dbError: DatabaseError = new DatabaseError("Failed to claim job from database", { originalError: errorMsg });
    logger.error(dbError, "[Worker] Failed to claim job");
    return false;
  }

  if (!jobToRun) return false;

  // Create child logger with traceId correlation
  const jobLogger: pino.Logger = logger.child({ traceId: jobToRun.id, jobName: jobToRun.name });

  jobLogger.info({ attempt: jobToRun.attempts }, "[Worker] Processing job");

  // Phase 2: Execute outside database lock transaction to keep transactions short
  try {
    await executeJob(
      {
        id: jobToRun.id,
        name: jobToRun.name,
        triggerMethod: jobToRun.triggerMethod,
        payload: jobToRun.payload,
      },
      jobLogger,
    );

    // Mark as completed
    await db
      .update(jobs)
      .set({
        status: "completed",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobToRun.id));

    jobLogger.info("[Worker] Job completed successfully");
  } catch (error: unknown) {
    const errorMsg: string = error instanceof Error ? error.message : String(error);
    const errorStack: string | undefined = error instanceof Error ? error.stack : undefined;
    const jobError: SchedulerError =
      error instanceof SchedulerError
        ? error
        : new JobExecutionError(`Job execution failed: ${errorMsg}`, { jobId: jobToRun.id, jobName: jobToRun.name, originalStack: errorStack });

    jobLogger.error(jobError, "[Worker] Job failed during execution");

    const isRetryable: boolean = jobToRun.attempts + 1 <= jobToRun.maxAttempts;
    const nextRetryDelay: number = (jobToRun.attempts + 1) * 10 * 1000; // 10s, 20s, 30s... backoff

    // Mark as failed or schedule for retry
    await db
      .update(jobs)
      .set({
        status: isRetryable ? "pending" : "failed",
        error: jobError.stack || jobError.message,
        finishedAt: isRetryable ? null : new Date(),
        scheduledAt: isRetryable ? new Date(Date.now() + nextRetryDelay) : jobToRun.scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobToRun.id));

    if (isRetryable) jobLogger.info({ retryDelayMs: nextRetryDelay }, "[Worker] Job rescheduled for retry");
    else jobLogger.error({ maxAttempts: jobToRun.maxAttempts }, "[Worker] Job failed permanently");
  }

  return true;
}

/**
 * Starts the worker loop.
 */
export async function startWorker(pollIntervalMs: number = 1000): Promise<void> {
  if (running) return;
  running = true;
  logger.info({ pollIntervalMs }, "[Worker] Worker loop started");

  async function loop(): Promise<void> {
    if (!running) return;

    let processed: boolean = false;
    try {
      processed = await pollAndRunJob();
    } catch (err: unknown) {
      logger.error(err, "[Worker] Error in worker loop");
    }

    // If a job was processed, poll again immediately to empty the queue.
    // Otherwise, wait for the poll interval.
    const delay: number = processed ? 10 : pollIntervalMs;
    timeoutId = setTimeout(loop, delay);
  }

  void loop();
}

/**
 * Stops the worker loop.
 */
export function stopWorker(): void {
  running = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  logger.info("[Worker] Worker loop stopped.");
}
