import pino from "pino";
import pretty from "pino-pretty";

const isProduction = process.env.NODE_ENV === "production";

// Configure pino logger
export const logger: pino.Logger = isProduction
  ? pino({
      level: process.env.LOG_LEVEL || "info",
      base: {
        service: process.env.SERVICE_NAME || "geonera-scheduler",
      },
    })
  : pino(
      {
        level: process.env.LOG_LEVEL || "info",
        base: {
          service: process.env.SERVICE_NAME || "geonera-scheduler",
        },
      },
      pretty({
        colorize: true,
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
        ignore: "pid,hostname",
      })
    );