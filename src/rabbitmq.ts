import amqp from "amqplib";
import { logger } from "./logger";
import { RabbitMQError } from "./errors";
import pino from "pino";

export interface PublishMessagePayload {
  queue?: string;
  exchange?: string;
  routingKey?: string;
  body?: unknown;
  traceId?: string;
}

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let isConnecting: boolean = false;
const assertedQueues: Set<string> = new Set<string>();

const RABBITMQ_URL: string = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";

/**
 * Get or establish a RabbitMQ connection and channel.
 * Implements reconnect logic in case the connection is lost.
 */
export async function getChannel(): Promise<amqp.Channel> {
  if (channel) return channel;

  if (isConnecting) {
    await new Promise<void>((resolve: (value: void | PromiseLike<void>) => void): void => {
      setTimeout(resolve, 500);
    });
    return getChannel();
  }

  isConnecting = true;
  try {
    if (!connection) {
      logger.info({ url: RABBITMQ_URL }, "[RabbitMQ] Connecting...");
      connection = await amqp.connect(RABBITMQ_URL);

      connection.on("error", (err: Error): void => {
        logger.error(err, "[RabbitMQ] Connection error");
        connection = null;
        channel = null;
        assertedQueues.clear();
      });

      connection.on("close", (): void => {
        logger.warn("[RabbitMQ] Connection closed. Reconnection will happen on the next publish.");
        connection = null;
        channel = null;
        assertedQueues.clear();
      });

      logger.info("[RabbitMQ] Connected successfully.");
    }

    const conn: amqp.ChannelModel | null = connection;
    if (conn && !channel) {
      channel = await conn.createChannel();
      channel.on("error", (err: Error): void => {
        logger.error(err, "[RabbitMQ] Channel error");
        channel = null;
        assertedQueues.clear();
      });
      channel.on("close", (): void => {
        logger.warn("[RabbitMQ] Channel closed.");
        channel = null;
        assertedQueues.clear();
      });
    }
  } catch (error: unknown) {
    connection = null;
    channel = null;
    const errorMsg: string = error instanceof Error ? error.message : String(error);
    const wrappedError: RabbitMQError = new RabbitMQError("Failed to connect to broker", { url: RABBITMQ_URL, originalError: errorMsg });
    logger.error(wrappedError, "[RabbitMQ] Failed to connect");
    throw wrappedError;
  } finally {
    isConnecting = false;
  }

  // Validate outside the try-catch block to prevent catching these validation errors locally
  if (!connection) throw new RabbitMQError("Connection failed to establish.", { url: RABBITMQ_URL });
  if (!channel) throw new RabbitMQError("Channel failed to establish.", { url: RABBITMQ_URL });

  return channel;
}

export async function publishMessage(payload: PublishMessagePayload, customLogger?: pino.Logger): Promise<void> {
  const ch: amqp.Channel = await getChannel();

  const exchange: string = payload.exchange || "";
  const queue: string = payload.queue || "";
  const log: pino.Logger = customLogger || logger;

  if (queue) {
    if (!assertedQueues.has(queue)) {
      await ch.assertQueue(queue, { durable: true });
      assertedQueues.add(queue);
    }

    const queueState: amqp.Replies.AssertQueue = await ch.checkQueue(queue);
    if (queueState.messageCount > 0) {
      log.info({ queue, messageCount: queueState.messageCount }, "[RabbitMQ] Skip publishing: queue already has pending messages.");
      return;
    }
  }

  // Routing key defaults to queue name if exchange is empty, otherwise empty string/routing key
  const routingKey: string = payload.routingKey || queue || "";
  const bodyContent: unknown = payload.body || {};
  const messageBuffer: Buffer = Buffer.from(typeof bodyContent === "string" ? bodyContent : JSON.stringify(bodyContent));

  const published: boolean = ch.publish(exchange, routingKey, messageBuffer, {
    persistent: true,
    timestamp: Date.now(),
    headers: payload.traceId ? { "x-trace-id": payload.traceId } : undefined,
  });

  if (!published) throw new RabbitMQError("Message publish buffer is full, could not publish.", { queue, exchange, routingKey, traceId: payload.traceId });

  log.info({ traceId: payload.traceId, queue, exchange, routingKey }, "[RabbitMQ] Published message successfully");
}

/**
 * Simple connection health check.
 */
export async function checkRabbitMQHealth(): Promise<boolean> {
  try {
    await getChannel();
    return true;
  } catch {
    return false;
  }
}