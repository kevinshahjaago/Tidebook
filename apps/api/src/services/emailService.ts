import nodemailer from "nodemailer";
import { EmailTriggerType, EmailStatus } from "@prisma/client";
import { prisma } from "../db";
import { config } from "../config";
import { logger } from "../logger";
import { encrypt, decrypt } from "../utils/encryption";
import { BookingStatus } from "@tidebook/shared";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const dkimOptions =
    config.DKIM_DOMAIN && config.DKIM_SELECTOR && config.DKIM_PRIVATE_KEY
      ? {
          dkim: {
            domainName: config.DKIM_DOMAIN,
            keySelector: config.DKIM_SELECTOR,
            privateKey: config.DKIM_PRIVATE_KEY.replace(/\\n/g, "\n"),
          },
        }
      : {};

  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
    ...dkimOptions,
  });

  return transporter;
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? "");
}

export async function sendEmailForBooking(
  bookingId: string,
  triggerType: EmailTriggerType,
  toAddress: string,
  variables: Record<string, string>
): Promise<void> {
  const template = await prisma.emailTemplate.findUnique({
    where: { triggerType },
  });

  if (!template || !template.isEnabled) {
    logger.debug({ triggerType, bookingId }, "Email template disabled or not found, skipping");
    return;
  }

  const subject = renderTemplate(template.subject, variables);
  const bodyHtml = renderTemplate(template.bodyHtml, variables);
  const bodyText = renderTemplate(template.bodyText, variables);

  const encryptedAddress = encrypt(toAddress);

  let status: EmailStatus = EmailStatus.SENT;
  let errorMessage: string | undefined;

  try {
    await getTransporter().sendMail({
      from: config.EMAIL_FROM,
      to: toAddress,
      subject,
      html: bodyHtml,
      text: bodyText,
    });
    logger.info({ bookingId, triggerType }, "Email sent");
  } catch (err) {
    status = EmailStatus.FAILED;
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, bookingId, triggerType }, "Failed to send email");
  }

  await prisma.emailLog.create({
    data: {
      bookingId,
      toAddress: encryptedAddress,
      triggerType,
      subject,
      status,
      errorMessage,
    },
  });
}

export async function scheduleEmailTriggers(
  bookingId: string,
  status: string,
  visitDate: string,
  rescheduleToken?: string
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      classBookings: { include: { classOffering: true } },
      scholarshipApplication: true,
    },
  });

  if (!booking) return;

  const contactEmail = decrypt(booking.contactEmail);
  const contactName = decrypt(booking.contactName);
  const organizationName = decrypt(booking.organizationName);

  const rescheduleLink = rescheduleToken
    ? `${config.WEB_BASE_URL}/reschedule?token=${rescheduleToken}`
    : "";

  const [cocSetting, paymentMethodSetting, paymentLinkUrlSetting, paymentLinkEmailSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "code_of_conduct_url" } }),
    prisma.appSetting.findUnique({ where: { key: "payment_method_options" } }),
    prisma.appSetting.findUnique({ where: { key: "booking_payment_link_url" } }),
    prisma.appSetting.findUnique({ where: { key: "booking_payment_link_email" } }),
  ]);
  const cocLink = cocSetting?.value ?? `${config.WEB_BASE_URL}/code-of-conduct`;
  const paymentLinkUrl = paymentLinkUrlSetting?.value ?? "";
  const paymentLinkEmail = paymentLinkEmailSetting?.value ?? "";

  let paymentInstructions = "";
  try {
    const methods: { value: string; emailInstructions: string }[] = JSON.parse(paymentMethodSetting?.value ?? "[]");
    paymentInstructions = methods.find((m) => m.value === booking.paymentMethod)?.emailInstructions ?? "";
  } catch { /* use empty string */ }

  const variables: Record<string, string> = {
    contactName,
    organizationName,
    visitDate: booking.visitDate,
    arrivalTimeSlot: booking.arrivalTimeSlot,
    studentCount: booking.studentCount.toString(),
    adultCount: booking.adultCount.toString(),
    bookingId: booking.id,
    rescheduleLink,
    bookingUrl: `${config.WEB_BASE_URL}/book`,
    className: booking.classBookings[0]?.classOffering?.name ?? "",
    classBooking: booking.classBookings.length > 0 ? "true" : "",
    declinedReason: booking.declinedReason ?? "",
    surveyLink: `${config.WEB_BASE_URL}/survey?booking=${booking.id}`,
    applicationLink: `${config.WEB_BASE_URL}/scholarship?booking=${booking.id}`,
    reimbursementLink: `${config.WEB_BASE_URL}/reimbursement?booking=${booking.id}`,
    cocLink,
    paymentInstructions,
    paymentLinkUrl,
    paymentLinkEmail,
  };

  if (status === BookingStatus.CONFIRMED) {
    const wasReviewed = !!booking.confirmedById;
    const trigger = wasReviewed
      ? EmailTriggerType.BOOKING_CONFIRMED_BY_REGISTRAR
      : EmailTriggerType.BOOKING_CONFIRMED_STANDARD;
    await sendEmailForBooking(bookingId, trigger, contactEmail, variables);

    // Send separate payment link email for online payment method
    if (booking.paymentMethod === "ONLINE_PAYMENT_LINK") {
      await sendEmailForBooking(bookingId, EmailTriggerType.ONLINE_PAYMENT_LINK_INFO, contactEmail, variables);
    }
  } else if (status === BookingStatus.PENDING) {
    await sendEmailForBooking(
      bookingId,
      EmailTriggerType.BOOKING_PENDING_REVIEW,
      contactEmail,
      variables
    );
    // Also send payment link email immediately for pending bookings with online payment
    if (booking.paymentMethod === "ONLINE_PAYMENT_LINK") {
      await sendEmailForBooking(bookingId, EmailTriggerType.ONLINE_PAYMENT_LINK_INFO, contactEmail, variables);
    }
  } else if (status === BookingStatus.DECLINED) {
    await sendEmailForBooking(
      bookingId,
      EmailTriggerType.BOOKING_DECLINED,
      contactEmail,
      variables
    );
  } else if (status === "SCHOLARSHIP_APPROVED") {
    const busReimbSetting = await prisma.appSetting.findUnique({ where: { key: "docusign_bus_reimbursement_url" } });
    await sendEmailForBooking(bookingId, EmailTriggerType.SCHOLARSHIP_APPROVED, contactEmail, {
      ...variables,
      reimbursementLink: busReimbSetting?.value ?? variables.reimbursementLink,
    });
  }
}

export async function sendReminderEmails(): Promise<void> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 14);
  const target = targetDate.toISOString().slice(0, 10);

  const bookings = await prisma.booking.findMany({
    where: {
      visitDate: target,
      status: BookingStatus.CONFIRMED,
    },
  });

  for (const booking of bookings) {
    const alreadySent = await prisma.emailLog.findFirst({
      where: {
        bookingId: booking.id,
        triggerType: EmailTriggerType.REMINDER_14_DAYS,
        status: EmailStatus.SENT,
      },
    });
    if (alreadySent) continue;

    const contactEmail = decrypt(booking.contactEmail);
    const cocSetting = await prisma.appSetting.findUnique({ where: { key: "code_of_conduct_url" } });
    const variables: Record<string, string> = {
      contactName: decrypt(booking.contactName),
      organizationName: decrypt(booking.organizationName),
      visitDate: booking.visitDate,
      arrivalTimeSlot: booking.arrivalTimeSlot,
      cocLink: cocSetting?.value ?? `${config.WEB_BASE_URL}/code-of-conduct`,
    };

    await sendEmailForBooking(booking.id, EmailTriggerType.REMINDER_14_DAYS, contactEmail, variables);
  }
}

export async function autoCompleteVisits(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const toComplete = await prisma.booking.findMany({
    where: {
      visitDate: { lt: today },
      status: BookingStatus.CONFIRMED,
    },
    select: { id: true },
  });

  for (const { id } of toComplete) {
    await prisma.booking.update({ where: { id }, data: { status: "COMPLETED" as any } });
    logger.info({ bookingId: id }, "Auto-completed past visit");
  }
}

export async function sendPostVisitSurveys(): Promise<void> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 2);
  const target = targetDate.toISOString().slice(0, 10);

  const bookings = await prisma.booking.findMany({
    where: {
      visitDate: target,
      status: BookingStatus.CONFIRMED,
    },
  });

  for (const booking of bookings) {
    const alreadySent = await prisma.emailLog.findFirst({
      where: {
        bookingId: booking.id,
        triggerType: EmailTriggerType.POST_VISIT_SURVEY,
        status: EmailStatus.SENT,
      },
    });
    if (alreadySent) continue;

    const contactEmail = decrypt(booking.contactEmail);
    await sendEmailForBooking(booking.id, EmailTriggerType.POST_VISIT_SURVEY, contactEmail, {
      contactName: decrypt(booking.contactName),
      surveyLink: `${config.WEB_BASE_URL}/survey?booking=${booking.id}`,
    });
  }
}
