import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "./logger";
import { config } from "./config";

const prisma = new PrismaClient({
  log: [
    {
      emit: "event",
      level: "query",
    },
    {
      emit: "event",
      level: "error",
    },
  ],
});

prisma.$on("query", (e: Prisma.QueryEvent) => {
  if (e.duration > config.SLOW_QUERY_THRESHOLD_MS) {
    logger.warn(
      { duration: e.duration, query: e.query },
      "Slow query detected"
    );
  }
});

prisma.$on("error", (e: Prisma.LogEvent) => {
  logger.error({ message: e.message }, "Prisma error");
});

export { prisma };
