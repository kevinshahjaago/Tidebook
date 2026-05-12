import { prisma } from "../db";
import { AuditActorType } from "@prisma/client";
import { logger } from "../logger";

interface AuditLogInput {
  actorId?: string;
  actorType: "USER" | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}

export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorType: input.actorType as AuditActorType,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before as any,
        after: input.after as any,
        ipAddress: input.ipAddress,
      },
    });
  } catch (err) {
    // Audit log failure must not break the main flow
    logger.error({ err, input }, "Failed to write audit log");
  }
}
