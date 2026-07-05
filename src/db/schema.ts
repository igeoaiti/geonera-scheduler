import { pgSchema, uuid, text, timestamp, integer, boolean, jsonb, index, PgSchema, PgEnum, PgColumn, IndexBuilder, PgTableWithColumns } from "drizzle-orm/pg-core";

// Define a dedicated schema namespace in PostgreSQL
export const schedulerSchema: PgSchema<"scheduler"> = pgSchema("scheduler");

// Define the job status enum for type-safety inside the scheduler schema
export const jobStatusEnum: PgEnum<["pending", "running", "completed", "failed"]> = schedulerSchema.enum("job_status", ["pending", "running", "completed", "failed"]);

// Column configuration interface for the job table
export type JobsColumns = {
  id: PgColumn<{
    name: "id";
    tableName: "jobs";
    dataType: "string";
    columnType: "PgUUID";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: true;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  name: PgColumn<{
    name: "name";
    tableName: "jobs";
    dataType: "string";
    columnType: "PgText";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  triggerMethod: PgColumn<{
    name: "trigger_method";
    tableName: "jobs";
    dataType: "string";
    columnType: "PgText";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  status: PgColumn<{
    name: "status";
    tableName: "jobs";
    dataType: "string";
    columnType: "PgEnum";
    data: "pending" | "running" | "completed" | "failed";
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: ["pending", "running", "completed", "failed"];
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  payload: PgColumn<{
    name: "payload";
    tableName: "jobs";
    dataType: "json";
    columnType: "PgJsonb";
    data: { queue?: string; exchange?: string; routingKey?: string; body?: Record<string, unknown> | string };
    driverParam: unknown;
    notNull: false;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  priority: PgColumn<{
    name: "priority";
    tableName: "jobs";
    dataType: "number";
    columnType: "PgInteger";
    data: number;
    driverParam: number;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  scheduledAt: PgColumn<{
    name: "scheduled_at";
    tableName: "jobs";
    dataType: "date";
    columnType: "PgTimestamp";
    data: Date;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  startedAt: PgColumn<{
    name: "started_at";
    tableName: "jobs";
    dataType: "date";
    columnType: "PgTimestamp";
    data: Date;
    driverParam: string;
    notNull: false;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  finishedAt: PgColumn<{
    name: "finished_at";
    tableName: "jobs";
    dataType: "date";
    columnType: "PgTimestamp";
    data: Date;
    driverParam: string;
    notNull: false;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  attempts: PgColumn<{
    name: "attempts";
    tableName: "jobs";
    dataType: "number";
    columnType: "PgInteger";
    data: number;
    driverParam: number;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  maxAttempts: PgColumn<{
    name: "max_attempts";
    tableName: "jobs";
    dataType: "number";
    columnType: "PgInteger";
    data: number;
    driverParam: number;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  error: PgColumn<{
    name: "error";
    tableName: "jobs";
    dataType: "string";
    columnType: "PgText";
    data: string;
    driverParam: string;
    notNull: false;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  createdAt: PgColumn<{
    name: "created_at";
    tableName: "jobs";
    dataType: "date";
    columnType: "PgTimestamp";
    data: Date;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  updatedAt: PgColumn<{
    name: "updated_at";
    tableName: "jobs";
    dataType: "date";
    columnType: "PgTimestamp";
    data: Date;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  [key: string]: PgColumn<any, any, any>;
};

// Explicit Table Type for jobs
export type JobsTable = PgTableWithColumns<{
  name: "jobs";
  schema: "scheduler";
  columns: JobsColumns;
  dialect: "pg";
}>;

// Define job table using a private typed constant
const _jobs: JobsTable = schedulerSchema.table(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    triggerMethod: text("trigger_method").default("RABBITMQ").notNull(), // 'RABBITMQ' or 'INTERNAL'
    status: jobStatusEnum("status").default("pending").notNull(),
    payload: jsonb("payload").$type<{
      queue?: string;
      exchange?: string;
      routingKey?: string;
      body?: Record<string, unknown> | string;
    }>(),
    priority: integer("priority").default(0).notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table: Record<string, PgColumn>): IndexBuilder[] => [
    // Speed up worker queries which look for pending jobs scheduled for past/present
    index("jobs_status_scheduled_idx").on(table.status, table.scheduledAt),
    // Speed up worker queries when checking for running instances of cron schedules
    index("jobs_status_name_idx").on(table.status, table.name),
  ],
) as unknown as JobsTable;

// Export explicit typed jobs variable
export const jobs: JobsTable = _jobs;

// Column configuration interface for the cron schedules table
export type CronSchedulesColumns = {
  id: PgColumn<{
    name: "id";
    tableName: "cron_schedules";
    dataType: "string";
    columnType: "PgUUID";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: true;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  name: PgColumn<{
    name: "name";
    tableName: "cron_schedules";
    dataType: "string";
    columnType: "PgText";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  triggerMethod: PgColumn<{
    name: "trigger_method";
    tableName: "cron_schedules";
    dataType: "string";
    columnType: "PgText";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  cronExpression: PgColumn<{
    name: "cron_expression";
    tableName: "cron_schedules";
    dataType: "string";
    columnType: "PgText";
    data: string;
    driverParam: string;
    notNull: true;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  payload: PgColumn<{
    name: "payload";
    tableName: "cron_schedules";
    dataType: "json";
    columnType: "PgJsonb";
    data: { queue?: string; exchange?: string; routingKey?: string; body?: Record<string, unknown> | string };
    driverParam: unknown;
    notNull: false;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  isActive: PgColumn<{
    name: "is_active";
    tableName: "cron_schedules";
    dataType: "boolean";
    columnType: "PgBoolean";
    data: boolean;
    driverParam: boolean;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  nextRunAt: PgColumn<{
    name: "next_run_at";
    tableName: "cron_schedules";
    dataType: "date";
    columnType: "PgTimestamp";
    data: Date;
    driverParam: string;
    notNull: true;
    hasDefault: false;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  createdAt: PgColumn<{
    name: "created_at";
    tableName: "cron_schedules";
    dataType: "date";
    columnType: "PgTimestamp";
    data: Date;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  updatedAt: PgColumn<{
    name: "updated_at";
    tableName: "cron_schedules";
    dataType: "date";
    columnType: "PgTimestamp";
    data: Date;
    driverParam: string;
    notNull: true;
    hasDefault: true;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  }>;
  [key: string]: PgColumn<any, any, any>;
};

// Explicit Table Type for cron schedules
export type CronSchedulesTable = PgTableWithColumns<{
  name: "cron_schedules";
  schema: "scheduler";
  columns: CronSchedulesColumns;
  dialect: "pg";
}>;

// Define cron schedules table using a private typed constant
const _cronSchedules: CronSchedulesTable = schedulerSchema.table(
  "cron_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(),
    triggerMethod: text("trigger_method").default("RABBITMQ").notNull(), // 'RABBITMQ' or 'INTERNAL'
    cronExpression: text("cron_expression").notNull(), // e.g. "*/5 * * * *"
    payload: jsonb("payload").$type<{
      queue?: string;
      exchange?: string;
      routingKey?: string;
      body?: Record<string, unknown> | string;
    }>(),
    isActive: boolean("is_active").default(true).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table: Record<string, PgColumn>): IndexBuilder[] => [
    // Speed up cron scheduler polls
    index("cron_is_active_next_run_idx").on(table.isActive, table.nextRunAt),
  ],
) as unknown as CronSchedulesTable;

// Export explicit typed cronSchedules variable
export const cronSchedules: CronSchedulesTable = _cronSchedules;
