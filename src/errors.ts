/**
 * Base custom error for the Geonera Scheduler.
 * Extends the native Error class to include structured context and timestamp.
 */
export class SchedulerError extends Error {
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = new Date();

    // Capture clean stack trace (supported in Bun/V8)
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when RabbitMQ operations (connect, publish, assert) fail.
 */
export class RabbitMQError extends SchedulerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * Thrown when database operations (queries, claims, transactions) fail.
 */
export class DatabaseError extends SchedulerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * Thrown when a job execution fails inside a worker.
 */
export class JobExecutionError extends SchedulerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * Thrown when cron parsing or schedule calculation/seeding fails.
 */
export class CronSchedulerError extends SchedulerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}
