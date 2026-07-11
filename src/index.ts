import { Hono, Context } from "hono";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { startWorker, stopWorker } from "./scheduler/worker";
import { seedSchedules, tickCronScheduler } from "./scheduler/cron";
import { db } from "./db";
import { jobs, cronSchedules } from "./db/schema";
import { checkRabbitMQHealth } from "./rabbitmq";
import { desc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { DatabaseError } from "./errors";
import type { Server } from "bun";

export interface JobCountByStatus {
  status: "pending" | "running" | "completed" | "failed";
  count: number;
}

export interface CronScheduleApiResponse {
  id: string;
  name: string;
  triggerMethod: "RABBITMQ" | "INTERNAL";
  cronExpression: string;
  nextRunAt: Date;
  isActive: boolean;
}

export interface ManualQueueJobRequest {
  name?: string;
  triggerMethod?: string;
  payload?: unknown;
  priority?: number;
  scheduledAt?: string;
}

export interface CronSchedulePayloadInfo {
  queue?: string;
  exchange?: string;
  routingKey?: string;
  body?: Record<string, unknown>;
}

const PORT: number = parseInt(process.env.PORT || "3000", 10);
const WORKER_POLL_INTERVAL: number = parseInt(process.env.WORKER_POLL_INTERVAL_MS || "1000", 10);
const CRON_POLL_INTERVAL: number = parseInt(process.env.CRON_POLL_INTERVAL_MS || "5000", 10);

/**
 * Bootstraps database seeder, workers, and cron checker loops.
 */
async function bootstrap(): Promise<void> {
  logger.info("[Bootstrap] Running database migrations...");
  try {
    await migrate(db, {
      migrationsFolder: "./drizzle",
      migrationsSchema: "drizzle",
      migrationsTable: "__geonera_scheduler_migrations",
    });
    logger.info("[Bootstrap] Database migrations applied successfully.");
  } catch (err: unknown) {
    const errorMsg: string = err instanceof Error ? err.message : String(err);
    logger.error(err, `[Bootstrap] Database migration failed: ${errorMsg}`);
    throw err;
  }

  logger.info("[Bootstrap] Initializing database & seeding Geonera cron schedules...");

  // Seed default cron configurations (creates schedules if they don't exist)
  await seedSchedules();

  // Start the worker loop that polls and executes pending jobs
  await startWorker(WORKER_POLL_INTERVAL);

  // Start the cron ticket timer to regularly spawn jobs
  const cronTimer: Timer = setInterval(async (): Promise<void> => {
    await tickCronScheduler();
  }, CRON_POLL_INTERVAL);

  logger.info("[Bootstrap] Scheduler background workers started.");

  // Clean shutdown handlers
  const shutdown: () => void = () => {
    logger.info("[Bootstrap] Intercepted shutdown signal. Stopping services...");
    clearInterval(cronTimer);
    stopWorker();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ----------------------------------------------------
// Hono REST API Setup
// ----------------------------------------------------
const app: Hono = new Hono();

// Enable CORS for all routes
app.use("*", cors());

// Welcome / Root Endpoint
app.get("/", (c: Context): Response => {
  return c.json({
    name: "geonera-scheduler",
    version: "1.0.0",
    status: "running",
  });
});

// Health Check Endpoint
app.get("/health", async (c: Context): Promise<Response> => {
  let dbOk: boolean = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch (e: unknown) {
    const errorMsg: string = e instanceof Error ? e.message : String(e);
    logger.error(new DatabaseError("DB Connection check failed", { originalError: errorMsg }), "[API] DB Connection check failed");
  }

  const rmqOk: boolean = await checkRabbitMQHealth();
  const overallStatus: number = dbOk && rmqOk ? 200 : 500;

  return c.json(
    {
      status: overallStatus === 200 ? "healthy" : "unhealthy",
      services: {
        database: dbOk ? "connected" : "disconnected",
        rabbitmq: rmqOk ? "connected" : "disconnected",
      },
      timestamp: new Date().toISOString(),
    },
    overallStatus as 200 | 500,
  );
});

// Overview metrics & schedules status
app.get("/api/jobs", async (c: Context): Promise<Response> => {
  // Aggregate job counts by status
  const counts: Array<JobCountByStatus> = await db
    .select({
      status: jobs.status,
      count: sql<number>`count(*)::int`,
    })
    .from(jobs)
    .groupBy(jobs.status)
    .execute();

  const stats: Record<string, number> = counts.reduce(
    (acc: Record<string, number>, curr: JobCountByStatus): Record<string, number> => {
      acc[curr.status] = curr.count;
      return acc;
    },
    { pending: 0, running: 0, completed: 0, failed: 0 } as Record<string, number>,
  );

  // Fetch 10 most recent jobs
  const recentJobs: Array<typeof jobs.$inferSelect> = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(10).execute();

  // Fetch all active schedules
  const schedules: Array<typeof cronSchedules.$inferSelect> = await db.select().from(cronSchedules).execute();

  return c.json({
    stats,
    schedules: schedules.map((s: typeof cronSchedules.$inferSelect): CronScheduleApiResponse => ({
      id: s.id,
      name: s.name,
      triggerMethod: s.triggerMethod as "RABBITMQ" | "INTERNAL",
      cronExpression: s.cronExpression,
      nextRunAt: s.nextRunAt,
      isActive: s.isActive,
    })),
    recentJobs,
  });
});

// Queue a manual ad-hoc job
app.post("/api/jobs", async (c: Context): Promise<Response> => {
  const body: ManualQueueJobRequest | null = (await c.req.json().catch((): null => null)) as ManualQueueJobRequest | null;

  if (!body || !body.name) return c.json({ error: "Missing required field: 'name'" }, 400);

  const inserted: Array<typeof jobs.$inferSelect> = await db
    .insert(jobs)
    .values({
      name: body.name,
      triggerMethod: body.triggerMethod || "RABBITMQ",
      payload: body.payload || {},
      priority: body.priority ?? 0,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
      status: "pending",
    })
    .returning()
    .execute();

  logger.info({ jobName: body.name, jobId: inserted[0].id, traceId: inserted[0].id }, "[API] Manually queued ad-hoc job");
  return c.json(
    {
      message: "Job enqueued successfully",
      job: inserted[0],
    },
    201,
  );
});

// Manually trigger a cron schedule immediately
app.post("/api/cron-schedules/trigger", async (c: Context): Promise<Response> => {
  const body: {
    name?: string;
  } | null = (await c.req.json().catch((): null => null)) as {
    name?: string;
  } | null;

  if (!body || !body.name) return c.json({ error: "Missing required field: 'name'" }, 400);

  const schedule: typeof cronSchedules.$inferSelect | undefined = await db.query.cronSchedules.findFirst({
    where: eq(cronSchedules.name, body.name),
  });

  if (!schedule) return c.json({ error: `Cron schedule "${body.name}" not found` }, 404);

  const schedPayload: CronSchedulePayloadInfo | null = schedule.payload as CronSchedulePayloadInfo | null;

  const existingBody: Record<string, unknown> = typeof schedPayload?.body === "object" ? schedPayload.body : {};

  // Spawn a pending job immediately
  const triggeredJob: Array<typeof jobs.$inferSelect> = await db
    .insert(jobs)
    .values({
      name: schedule.name,
      triggerMethod: schedule.triggerMethod,
      payload: {
        ...schedPayload,
        body: {
          ...existingBody,
          triggeredManually: true,
          triggeredAt: new Date().toISOString(),
        },
      },
      scheduledAt: new Date(),
      status: "pending",
      priority: 5, // Slightly higher priority for manual trigger
    })
    .returning()
    .execute();

  logger.info({ cronName: schedule.name, jobId: triggeredJob[0].id, traceId: triggeredJob[0].id }, "[API] Manually triggered cron schedule");
  return c.json(
    {
      message: `Cron schedule "${schedule.name}" triggered immediately.`,
      job: triggeredJob[0],
    },
    201,
  );
});

// ----------------------------------------------------
// Scalar API Documentation / OpenAPI Spec
// ----------------------------------------------------
const openApiSpec: Record<string, unknown> = {
  openapi: "3.0.0",
  info: {
    title: "Geonera Job Scheduler API",
    version: "1.0.0",
    description: "API for queueing, triggering, and monitoring jobs in the Geonera Ingestion pipeline",
  },
  paths: {
    "/health": {
      get: {
        summary: "Check service health",
        description: "Returns connection status of PostgreSQL database and RabbitMQ broker.",
        responses: {
          200: { description: "Overall service is healthy." },
          500: { description: "Service is degraded/unhealthy." },
        },
      },
    },
    "/api/jobs": {
      get: {
        summary: "Get current job statistics and logs",
        description: "Returns statistics of jobs by status, list of all registered cron schedules, and the 10 most recent job logs.",
        responses: {
          200: { description: "Stats and logs fetched successfully." },
        },
      },
      post: {
        summary: "Queue a manual one-off job",
        description: "Directly inserts a job into the queue. By default, it publishes the payload to RabbitMQ.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Name of the job." },
                  triggerMethod: { type: "string", enum: ["RABBITMQ", "INTERNAL"], default: "RABBITMQ", description: "How to trigger the job." },
                  payload: { type: "object", description: "Payload settings (RabbitMQ queue, body, etc)." },
                  priority: { type: "integer", default: 0, description: "Job priority. Higher runs first." },
                  scheduledAt: { type: "string", format: "date-time", description: "Delay job execution until this ISO timestamp." },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          201: { description: "Job queued successfully." },
          400: { description: "Invalid request payload." },
        },
      },
    },
    "/api/cron-schedules/trigger": {
      post: {
        summary: "Trigger a cron schedule immediately",
        description: "Creates an immediate one-off execution instance of the selected cron schedule, bypassing its regular run grid.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Name of the registered cron schedule (e.g. 'maintenance')." },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          201: { description: "Cron schedule triggered immediately." },
          400: { description: "Invalid request payload." },
          404: { description: "Cron schedule not found." },
        },
      },
    },
  },
};

// Serve OpenAPI JSON doc
app.get("/doc", (c: Context): Response => c.json(openApiSpec));

// Render Scalar Documentation UI
app.get(
  "/reference",
  Scalar({
    spec: {
      url: "/doc",
    },
    theme: "solarized",
  }),
);

// Start Server using Hono app handler
const server: Server<undefined> = Bun.serve({
  port: PORT,
  fetch: app.fetch,
});

logger.info({ port: server.port }, "[API] Geonera REST API server listening");

// Run bootstrap in background
bootstrap().catch((err: unknown): void => {
  logger.error(err, "[Bootstrap] Initialization failed fatally");
  process.exit(1);
});
