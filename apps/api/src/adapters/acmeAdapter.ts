import { prisma } from "../db";
import { config } from "../config";
import { logger } from "../logger";
import { decrypt } from "../utils/encryption";

export interface AcmePayload {
  groupName: string;
  visitDate: string;
  arrivalTime: string;
  groupSize: number;
  ticketType: string;
  paymentStatus: string;
  orderReference: string;
}

export interface AcmeResponse {
  orderNumber: string;
  status: string;
}

// Adapter interface — allows swapping ACME implementation without touching booking logic
interface AcmeAdapter {
  pushBooking(bookingId: string, payload: AcmePayload): Promise<AcmeResponse>;
}

class LiveAcmeAdapter implements AcmeAdapter {
  async pushBooking(bookingId: string, payload: AcmePayload): Promise<AcmeResponse> {
    const response = await fetch(`${config.ACME_API_URL}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ACME_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ACME API returned ${response.status}: ${body}`);
    }

    return response.json() as Promise<AcmeResponse>;
  }
}

class MockAcmeAdapter implements AcmeAdapter {
  async pushBooking(bookingId: string, payload: AcmePayload): Promise<AcmeResponse> {
    logger.debug({ bookingId, payload }, "Mock ACME push");
    // Simulate realistic response delay
    await new Promise((r) => setTimeout(r, 50));
    return {
      orderNumber: `MOCK-${Date.now()}`,
      status: "confirmed",
    };
  }
}

function getAdapter(): AcmeAdapter {
  return config.ACME_USE_MOCK ? new MockAcmeAdapter() : new LiveAcmeAdapter();
}

export async function pushToAcme(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;

  const organizationName = decrypt(booking.organizationName);
  const groupSize = booking.studentCount + booking.adultCount;

  const payload: AcmePayload = {
    groupName: organizationName,
    visitDate: booking.visitDate,
    arrivalTime: booking.arrivalTimeSlot,
    groupSize,
    ticketType: booking.groupType,
    paymentStatus: booking.paymentMethod,
    orderReference: booking.id,
  };

  const start = Date.now();
  try {
    const result = await getAdapter().pushBooking(bookingId, payload);
    const duration = Date.now() - start;

    await prisma.booking.update({
      where: { id: bookingId },
      data: { acmeOrderNumber: result.orderNumber },
    });

    logger.info({ bookingId, orderNumber: result.orderNumber, duration }, "ACME push succeeded");
  } catch (err) {
    const duration = Date.now() - start;
    logger.error({ err, bookingId, duration }, "ACME push failed — booking flagged for manual follow-up");

    // Flag via internal note so Registrar sees it
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        internalNotes: `[SYSTEM] ACME push failed at ${new Date().toISOString()}. Manual entry required.\n${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    });
  }
}

export async function retryAcmePush(bookingId: string): Promise<void> {
  await pushToAcme(bookingId);
}
