import pino from "pino";

export const pinoConfig = {
  level: process.env.NODE_ENV === "production" ? "info" : "debug",

  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
};

const logger = pino(pinoConfig);
export default logger;
