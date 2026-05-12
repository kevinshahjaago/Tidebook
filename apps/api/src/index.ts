import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./logger";
import { prisma } from "./db";
import { sendReminderEmails, sendPostVisitSurveys, autoCompleteVisits } from "./services/emailService";

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "Tidebook API started");
});

// ─── Background jobs ──────────────────────────────────────────────────────────

async function runDailyJobs() {
  logger.info("Running daily background jobs");
  try { await autoCompleteVisits(); } catch (err) { logger.error({ err }, "autoCompleteVisits failed"); }
  try { await sendReminderEmails(); } catch (err) { logger.error({ err }, "sendReminderEmails failed"); }
  try { await sendPostVisitSurveys(); } catch (err) { logger.error({ err }, "sendPostVisitSurveys failed"); }
}

async function cleanupExpiredHolds() {
  try {
    const deleted = await prisma.slotHold.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    if (deleted.count > 0) logger.info({ count: deleted.count }, "Cleaned up expired slot holds");
  } catch (err) { logger.error({ err }, "Hold cleanup failed"); }
}

// Run daily jobs every hour — each function is idempotent so running multiple times is safe
setInterval(runDailyJobs, 60 * 60 * 1000);
// Clean up expired holds every 5 minutes
setInterval(cleanupExpiredHolds, 5 * 60 * 1000);
// Run on startup after a short delay to let the DB connection settle
setTimeout(runDailyJobs, 30_000);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
