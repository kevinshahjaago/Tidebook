import { PrismaClient, UserRole, EmailTriggerType } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in environment"
    );
  }

  // Admin user
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    console.log(`Created admin user: ${adminEmail}`);
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  // Default Season
  const existingSeason = await prisma.season.findFirst({
    where: { name: "2025–2026" },
  });

  if (!existingSeason) {
    await prisma.season.create({
      data: {
        name: "2025–2026",
        startDate: "2026-01-05",
        endDate: "2026-06-30",
        registrationOpensAt: new Date("2025-10-01T00:00:00Z"),
        registrationClosesAt: new Date("2026-06-15T23:59:59Z"),
        defaultDailyCapacity: 300,
        isPublished: false,
      },
    });
    console.log("Created default season: 2025–2026");
  }

  // Default class offerings
  const classes = [
    {
      name: "Puget Sound Ecology",
      description:
        "Students explore the diverse ecosystem of Puget Sound, examining food webs, adaptations, and human impacts. Hands-on specimens included.",
      gradeMin: 3,
      gradeMax: 8,
      capacity: 30,
      resourceRequirements: "Specimen trays, field guides",
    },
    {
      name: "Ocean Adaptations",
      description:
        "An inquiry-based investigation into how marine animals adapt to their environments. Students examine live and preserved specimens.",
      gradeMin: 2,
      gradeMax: 6,
      capacity: 30,
      resourceRequirements: "Adaptation cards, magnifying glasses",
    },
    {
      name: "Marine Food Webs",
      description:
        "Students build and analyze marine food webs, exploring energy flow and the role of each organism from phytoplankton to orca.",
      gradeMin: 4,
      gradeMax: 10,
      capacity: 35,
      resourceRequirements: "Food web cards, orca skeleton model",
    },
    {
      name: "Plankton & Ocean Life",
      description:
        "Students collect and examine live plankton samples using microscopes, connecting to primary production and marine ecosystems.",
      gradeMin: 5,
      gradeMax: 12,
      capacity: 25,
      resourceRequirements: "Plankton tow equipment, microscopes",
    },
    {
      name: "Tide Pool Discoveries",
      description:
        "Simulated tide pool exploration examining invertebrate adaptations, zonation, and conservation. Great for younger learners.",
      gradeMin: 1,
      gradeMax: 5,
      capacity: 30,
      resourceRequirements: "Tide pool specimens, identification guides",
    },
  ];

  for (const cls of classes) {
    const existing = await prisma.classOffering.findFirst({
      where: { name: cls.name },
    });
    if (!existing) {
      await prisma.classOffering.create({
        data: { ...cls, isActive: true, durationMinutes: 60 },
      });
      console.log(`Created class: ${cls.name}`);
    }
  }

  // Email templates
  const templates: Array<{
    triggerType: EmailTriggerType;
    subject: string;
    bodyHtml: string;
    bodyText: string;
  }> = [
    {
      triggerType: EmailTriggerType.BOOKING_CONFIRMED_STANDARD,
      subject: "Your Seattle Aquarium School Visit is Confirmed! 🐠",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Great news! Your group visit to the Seattle Aquarium is confirmed.</p>
<ul>
  <li><strong>Visit Date:</strong> {{visitDate}}</li>
  <li><strong>Arrival Time:</strong> {{arrivalTimeSlot}}</li>
  <li><strong>Group:</strong> {{organizationName}}</li>
  <li><strong>Group Size:</strong> {{studentCount}} students + {{adultCount}} adults</li>
  {{#if classBooking}}<li><strong>Class:</strong> {{className}}</li>{{/if}}
</ul>
<h3>Payment Information</h3>
<p>{{paymentInstructions}}</p>
<p>Need to reschedule? Use your <a href="{{rescheduleLink}}">self-service reschedule link</a> (available until 48 hours before your visit).</p>
<p>See you soon!</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nYour visit is confirmed.\n\nVisit Date: {{visitDate}}\nArrival: {{arrivalTimeSlot}}\nGroup: {{organizationName}}\nSize: {{studentCount}} students + {{adultCount}} adults\n\nPayment Information:\n{{paymentInstructions}}\n\nReschedule: {{rescheduleLink}}\n\nSee you soon!\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.BOOKING_PENDING_REVIEW,
      subject: "We Received Your Seattle Aquarium Visit Request",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Thank you for submitting your group visit request for <strong>{{visitDate}}</strong>. Your request is under review and we'll be in touch within 2 business days.</p>
<p>Reference number: <strong>{{bookingId}}</strong></p>
<p>Questions? Reply to this email.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nThank you for your visit request for {{visitDate}}. We'll be in touch within 2 business days.\n\nReference: {{bookingId}}\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.BOOKING_CONFIRMED_BY_REGISTRAR,
      subject: "Your Seattle Aquarium Visit Request is Approved",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Your group visit request has been reviewed and approved!</p>
<ul>
  <li><strong>Visit Date:</strong> {{visitDate}}</li>
  <li><strong>Arrival Time:</strong> {{arrivalTimeSlot}}</li>
  <li><strong>Group:</strong> {{organizationName}}</li>
  <li><strong>Group Size:</strong> {{studentCount}} students + {{adultCount}} adults</li>
</ul>
<h3>Payment Information</h3>
<p>{{paymentInstructions}}</p>
<p><a href="{{rescheduleLink}}">Reschedule if needed</a></p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nYour visit has been approved.\n\nDate: {{visitDate}}\nTime: {{arrivalTimeSlot}}\n\nPayment Information:\n{{paymentInstructions}}\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.BOOKING_DECLINED,
      subject: "Update on Your Seattle Aquarium Visit Request",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Thank you for your interest in visiting the Seattle Aquarium. Unfortunately, we are unable to accommodate your visit request for <strong>{{visitDate}}</strong>.</p>
<p><strong>Reason:</strong> {{declinedReason}}</p>
<p>We'd love to find another time that works. <a href="{{bookingUrl}}">Submit a new request here</a>.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nWe cannot accommodate your visit for {{visitDate}}.\n\nReason: {{declinedReason}}\n\nSubmit a new request at: {{bookingUrl}}\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.RESCHEDULE_COMPLETED,
      subject: "Your Seattle Aquarium Visit Has Been Rescheduled",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Your visit has been successfully rescheduled.</p>
<ul>
  <li><strong>New Visit Date:</strong> {{visitDate}}</li>
  <li><strong>New Arrival Time:</strong> {{arrivalTimeSlot}}</li>
</ul>
<p><a href="{{rescheduleLink}}">Need to reschedule again?</a></p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nYour visit has been rescheduled.\n\nNew Date: {{visitDate}}\nNew Time: {{arrivalTimeSlot}}\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.RESCHEDULE_PENDING_REVIEW,
      subject: "Your Reschedule Request is Under Review",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Your reschedule request is under review. We'll be in touch within 1–2 business days.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nYour reschedule request is under review. We'll follow up within 1-2 business days.\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.REMINDER_14_DAYS,
      subject: "Your Seattle Aquarium Visit is in 2 Weeks!",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Just a reminder that your group visit to the Seattle Aquarium is coming up on <strong>{{visitDate}}</strong> at <strong>{{arrivalTimeSlot}}</strong>.</p>
<h3>Before You Arrive</h3>
<ul>
  <li>Chaperone minimum ratio: 1 adult per 5 students</li>
  <li>Arrive 10 minutes before your scheduled time</li>
  <li>Please review the <a href="{{cocLink}}">Code of Conduct</a> with your group</li>
  <li>Parking is available in the adjacent garage</li>
</ul>
<p>Questions? Reply to this email.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nYour visit is on {{visitDate}} at {{arrivalTimeSlot}}.\n\nReminders:\n- Chaperone ratio: 1:5\n- Arrive 10 min early\n- Review Code of Conduct\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.POST_VISIT_SURVEY,
      subject: "How Was Your Seattle Aquarium Visit? Share Your Feedback",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Thank you for visiting the Seattle Aquarium with your group! We hope you had a wonderful experience.</p>
<p>We'd love to hear your feedback: <a href="{{surveyLink}}">Take our 5-minute survey</a></p>
<p>Thank you for supporting ocean conservation education!</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nThank you for your visit! Please share your feedback: {{surveyLink}}\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.SCHOLARSHIP_APPROVED,
      subject: "Your Seattle Aquarium Scholarship Application is Approved",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Congratulations! Your scholarship application for your group's visit to the Seattle Aquarium has been approved.</p>
<p>Next steps and any remaining requirements will be shared separately. If you have questions, please reply to this email.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nYour scholarship application has been approved. We'll follow up with next steps.\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.SCHOLARSHIP_INCOMPLETE_10_DAYS,
      subject: "Action Required: Complete Your Scholarship Application",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Your scholarship application is still incomplete. Please <a href="{{applicationLink}}">complete your application</a> as soon as possible to secure funding for your visit on <strong>{{visitDate}}</strong>.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nYour scholarship application needs to be completed. Please visit {{applicationLink}}.\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.SCHOLARSHIP_INCOMPLETE_FOLLOWUP,
      subject: "Reminder: Scholarship Application Still Pending",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>This is a reminder that your scholarship application is still pending. <a href="{{applicationLink}}">Complete it here</a>.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nReminder: scholarship application pending. Complete at: {{applicationLink}}\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.BUS_REIMBURSEMENT_INFO,
      subject: "Bus Reimbursement Available for Your Seattle Aquarium Visit",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Thank you for visiting the Seattle Aquarium! As a scholarship recipient, you may be eligible for bus reimbursement of up to $500 per bus.</p>
<p>To apply, please <a href="{{reimbursementLink}}">complete the reimbursement form</a>. Applications must be submitted within 30 days of your visit.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nYou may be eligible for bus reimbursement (up to $500/bus). Apply at: {{reimbursementLink}}\n\nSeattle Aquarium Education Team`,
    },
    {
      triggerType: EmailTriggerType.ONLINE_PAYMENT_LINK_INFO,
      subject: "Payment Link for Your Seattle Aquarium Visit",
      bodyHtml: `<p>Hi {{contactName}},</p>
<p>Thank you for registering your group visit to the Seattle Aquarium on <strong>{{visitDate}}</strong>.</p>
<p>Please use the link below to complete your payment:</p>
<p><a href="{{paymentLinkUrl}}">{{paymentLinkUrl}}</a></p>
<p>If you have questions about payment, please contact us at <a href="mailto:{{paymentLinkEmail}}">{{paymentLinkEmail}}</a>.</p>
<p>Payment is due no later than the day of your visit.</p>
<p>Seattle Aquarium Education Team</p>`,
      bodyText: `Hi {{contactName}},\n\nThank you for registering your group visit on {{visitDate}}.\n\nPlease complete your payment at: {{paymentLinkUrl}}\n\nQuestions? Contact us at: {{paymentLinkEmail}}\n\nPayment is due no later than the day of your visit.\n\nSeattle Aquarium Education Team`,
    },
  ];

  for (const template of templates) {
    await prisma.emailTemplate.upsert({
      where: { triggerType: template.triggerType },
      update: {},
      create: template,
    });
  }
  console.log("Upserted email templates");

  // Default app settings
  const defaultSettings = [
    // ── Operational ────────────────────────────────────────────────────────────
    { key: "chaperone_ratio_lower_grades", value: "5" },
    { key: "chaperone_ratio_upper_grades", value: "10" },
    { key: "chaperone_ratio_default", value: "5" },
    { key: "class_break_minutes", value: "45" },
    { key: "class_arrival_buffer_minutes", value: "15" },
    { key: "slot_hold_minutes", value: "15" },
    // ── Booking Portal ─────────────────────────────────────────────────────────
    { key: "booking_portal_enabled", value: "true" },
    { key: "booking_portal_closed_message", value: "Online registration is not currently open. Please check back soon or contact us directly to schedule your visit." },
    { key: "cancellation_cutoff_days", value: "5" },
    { key: "reschedule_cutoff_days", value: "2" },
    { key: "limited_availability_threshold", value: "30" },
    { key: "scholarship_budget_total", value: "50000" },
    { key: "large_group_threshold", value: "60" },
    { key: "arrival_slot_interval_minutes", value: "30" },
    { key: "arrival_slot_start", value: "09:00" },
    { key: "arrival_slot_end", value: "14:00" },
    { key: "data_retention_years", value: "7" },
    // ── URLs ───────────────────────────────────────────────────────────────────
    { key: "post_visit_survey_url", value: "https://forms.seattleaquarium.org/visit-survey" },
    { key: "docusign_bus_reimbursement_url", value: "https://docusign.seattleaquarium.org/bus-reimbursement" },
    { key: "code_of_conduct_url", value: "https://seattleaquarium.org/wp-content/uploads/2024/09/Seattle-Aquarium-Field-Trip-Code-of-Conduct-2024-25.pdf" },
    // ── Group Types (JSON array — configurable list, order, labels, descriptions) ─
    { key: "group_type_options", value: JSON.stringify([
      { value: "SCHOOL",     label: "School Group",        description: "K–12 public and private schools" },
      { value: "HOMESCHOOL", label: "Home-School Family",  description: "Home-school cooperatives and families" },
      { value: "CORPORATE",  label: "Corporate Group",     description: "Businesses, teams, and professional groups" },
      { value: "ADHOC",      label: "Ad-Hoc Group",        description: "Clubs, scouts, and other community organizations" },
    ]) },
    // ── Payment Methods (JSON array — configurable label, description, subtext, email instructions) ─
    { key: "payment_method_options", value: JSON.stringify([
      {
        value: "CASH_OR_CHECK",
        label: "Cash or Check (day of visit)",
        description: "We accept cash and checks made payable to 'Seattle Aquarium'.",
        subtext: "Please bring exact payment on the day of your visit. A staff member will collect payment at check-in.",
        emailInstructions: "Payment is due at check-in on the day of your visit. We accept cash and checks made payable to 'Seattle Aquarium'.",
        isVisible: true,
      },
      {
        value: "CREDIT_DEBIT",
        label: "Credit or Debit Card (via call or in-person)",
        description: "Call us to pay by card, or pay in person at the ticket window.",
        subtext: "A team member will contact you to process payment, or you may call our education office directly.",
        emailInstructions: "To pay by credit or debit card, please call our education office or stop by the ticket window on arrival.",
        isVisible: true,
      },
      {
        value: "ONLINE_PAYMENT_LINK",
        label: "Online Payment Link",
        description: "We will send you a secure payment link by email.",
        subtext: "After your booking is submitted, you will receive a separate email with a secure link to complete payment online.",
        emailInstructions: "You will receive a separate email with your secure online payment link shortly.",
        isVisible: true,
      },
      {
        value: "INVOICE",
        label: "Purchase Order / Invoice",
        description: "For organizations that pay by purchase order or invoice.",
        subtext: "Please include your booking reference number on your purchase order. An invoice will be sent to the email address on your registration.",
        emailInstructions: "An invoice will be sent to the email address on your registration. Please submit payment within 30 days of receipt.",
        isVisible: true,
      },
      {
        value: "SCHOLARSHIP",
        label: "Applying for a Scholarship",
        description: "For Title I schools and qualifying organizations.",
        subtext: "Scholarship applications are reviewed within 5 business days. You will be contacted by our education team.",
        emailInstructions: "You have applied for scholarship funding. Our team will review your application and be in touch within 5 business days.",
        isVisible: true,
      },
    ]) },
    // ── Payment Subtext & Online Payment Link ──────────────────────────────────
    { key: "booking_payment_subtext", value: "Payment is due no later than the day of your visit. Please note that passes, discount tickets, coupons, **Seattle Aquarium memberships are not valid for school group admission fees.**" },
    { key: "booking_payment_link_url", value: "" },
    { key: "booking_payment_link_email", value: "registration@seattleaquarium.org" },
    // ── Contact Info Footer ────────────────────────────────────────────────────
    { key: "booking_contact_footer", value: "For questions email [registration@seattleaquarium.org](mailto:registration@seattleaquarium.org). Due to high volume it may take us at least a week to respond." },
    // ── Booking Form Copy ──────────────────────────────────────────────────────
    { key: "booking_form_subtitle", value: "School & Public Programs — Group Visit Registration" },
    { key: "booking_connections_notice", value: "Connections Partners (nonprofits, YMCAs, community centers) have a dedicated portal —" },
    { key: "booking_class_step_description", value: "Enhance your visit with a facilitated 60-minute program led by our education staff." },
    { key: "booking_coc_prefix", value: "I have read and agree to the " },
    { key: "booking_coc_link_label", value: "Code of Conduct" },
    { key: "booking_coc_suffix", value: " and confirm I will review it with my group before the visit." },
    { key: "booking_special_requests_label", value: "Special Requests" },
    { key: "booking_school_district_hint", value: "Enter N/A for private schools, home schools, & colleges/universities." },
    { key: "booking_slot_hold_banner", value: "Your slot for {time} arrival on {date} is reserved for {timer}" },
    { key: "accessibility_options", value: JSON.stringify([
      "Wheelchair access",
      "Elevator access needed",
      "Hearing loop or amplification",
      "Service animal accommodations",
      "EpiPen or allergy medication",
      "Large-print materials",
      "Sensory-friendly accommodations",
      "Visual impairment assistance",
    ]) },
  ];

  for (const setting of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log("Upserted app settings");

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
