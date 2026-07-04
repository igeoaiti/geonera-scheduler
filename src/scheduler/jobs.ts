import { publishMessage } from "../rabbitmq";
import { db } from "../db";
import { jobs } from "../db/schema";
import { lte, and, inArray } from "drizzle-orm";
import { logger } from "../logger";
import { JobExecutionError } from "../errors";
import pino from "pino";

export type JobHandler = (payload: unknown, jobName: string, jobLogger?: pino.Logger) => Promise<void>;

/**
 * Registry for INTERNAL jobs that run code directly within this scheduler container.
 */
export const internalHandlers: Record<string, JobHandler> = {
  "cleanup-jobs": async (payload: unknown, _jobName: string, jobLogger?: pino.Logger): Promise<void> => {
    const log: pino.Logger = jobLogger || logger;
    // Default retention period is 7 days as requested by user
    const typedPayload: { retentionDays?: number } | null = payload as { retentionDays?: number } | null;
    const retentionDays: number = typedPayload?.retentionDays ?? 7;
    log.info({ retentionDays }, "[Worker] Running cleanup-jobs...");
    
    const cutoffDate: Date = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deletedJobs: Array<{ id: string; name: string; status: "pending" | "running" | "completed" | "failed"; finishedAt: Date | null }> = await db
      .delete(jobs)
      .where(
        and(
          inArray(jobs.status, ["completed", "failed"]),
          lte(jobs.finishedAt, cutoffDate)
        )
      )
      .returning({ id: jobs.id, name: jobs.name, status: jobs.status, finishedAt: jobs.finishedAt });

    log.info({ deletedCount: deletedJobs.length }, "[Worker] Cleaned up old job record(s).");
  }
};

/**
 * Core execution dispatcher for scheduled jobs.
 */
export async function executeJob(
  job: {
    id: string;
    name: string;
    triggerMethod: string;
    payload: unknown;
  },
  jobLogger?: pino.Logger
): Promise<void> {
  const log: pino.Logger = jobLogger || logger;
  log.info({ triggerMethod: job.triggerMethod }, "[Worker] Starting execution");

  if (job.triggerMethod === "RABBITMQ") {
    const rabbitPayload = job.payload as {
      queue?: string; exchange?: string; routingKey?: string; body?: unknown;
    } | null;
    
    // Resolve publishing settings
    // If not specified, default queue naming: "jobs.[jobName]" (replacing '-' with '.' for ticks-regular etc., or just using queue setting)
    const queue: string = rabbitPayload?.queue || `jobs.${job.name.replace("-", ".")}`;
    const exchange: string = rabbitPayload?.exchange || "";
    const routingKey: string = rabbitPayload?.routingKey || queue;
    
    // Default message payload including traceId
    const body: unknown = rabbitPayload?.body || {
      job: job.name,
      jobId: job.id,
      traceId: job.id,
      timestamp: new Date().toISOString(),
    };

    await publishMessage({
      queue,
      exchange,
      routingKey,
      body,
      traceId: job.id,
    }, log);
  } else if (job.triggerMethod === "INTERNAL") {
    const handler: JobHandler | undefined = internalHandlers[job.name];
    if (!handler) {
      throw new JobExecutionError(`Internal handler for "${job.name}" not found.`, { jobId: job.id, jobName: job.name });
    }
    await handler(job.payload, job.name, log);
  } else {
    throw new JobExecutionError(`Unsupported trigger method: "${job.triggerMethod}"`, { jobId: job.id, jobName: job.name });
  }
}
