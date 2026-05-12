import { prisma } from "../db";
import { EmailTriggerType, JourneyTrigger } from "@prisma/client";
import { scheduleEmailTriggers } from "./emailService";
import { subDays, addDays, parseISO } from "date-fns";
import { logger } from "../logger";

type JourneyEmailStep = {
  id: string;
  type: "send_email";
  templateType: string;
  timing: {
    type: "immediately" | "days_before_visit" | "days_after_trigger";
    days?: number;
  };
};

export async function triggerJourney(
  trigger: JourneyTrigger,
  bookingId: string,
  visitDate: string
): Promise<void> {
  const journeys = await prisma.emailJourney.findMany({
    where: { trigger, isEnabled: true },
    orderBy: { sortOrder: "asc" },
  });

  for (const journey of journeys) {
    const steps = (journey.steps as unknown as JourneyEmailStep[]) ?? [];
    for (const step of steps) {
      if (step.type !== "send_email") continue;

      let scheduledFor: Date;
      const now = new Date();
      const timing = step.timing ?? { type: "immediately" };

      if (timing.type === "immediately") {
        scheduledFor = now;
      } else if (timing.type === "days_before_visit") {
        scheduledFor = subDays(parseISO(visitDate + "T12:00:00Z"), timing.days ?? 0);
      } else {
        scheduledFor = addDays(now, timing.days ?? 0);
      }

      // Don't schedule past events (e.g. reminder for past visit date)
      if (scheduledFor < now && timing.type !== "immediately") continue;

      await prisma.scheduledEmail.create({
        data: {
          bookingId,
          journeyId: journey.id,
          stepId: step.id,
          templateType: step.templateType as EmailTriggerType,
          scheduledFor,
          status: "PENDING",
        },
      });

      // Fire immediately-scheduled emails right away
      if (timing.type === "immediately") {
        const pending = await prisma.scheduledEmail.findFirst({
          where: { bookingId, journeyId: journey.id, stepId: step.id, status: "PENDING" },
        });
        if (pending) await sendAndMarkScheduled(pending.id, bookingId);
      }
    }
  }
}

async function sendAndMarkScheduled(scheduledEmailId: string, bookingId: string): Promise<void> {
  const scheduled = await prisma.scheduledEmail.findUnique({ where: { id: scheduledEmailId } });
  if (!scheduled || scheduled.status !== "PENDING") return;

  try {
    await scheduleEmailTriggers(bookingId, scheduled.templateType as string);
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, scheduledEmailId }, "Failed to send scheduled email");
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: "FAILED", errorMessage: String(err) },
    });
  }
}

export async function processScheduledEmails(): Promise<{ processed: number; failed: number }> {
  const due = await prisma.scheduledEmail.findMany({
    where: { status: "PENDING", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });

  let processed = 0;
  let failed = 0;

  for (const item of due) {
    try {
      await sendAndMarkScheduled(item.id, item.bookingId);
      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}
