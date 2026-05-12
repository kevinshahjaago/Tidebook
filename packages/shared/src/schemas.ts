import { z } from "zod";
import { GroupType, PaymentMethod } from "./enums";

// ─── Common ──────────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please select a visit date from the calendar");

export const timeSlotSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Please select an arrival time for your group");

// ─── Booking ──────────────────────────────────────────────────────────────────

export const createBookingSchema = z.object({
  groupType: z.nativeEnum(GroupType).refine((val) => val !== GroupType.CONNECTIONS, {
    message: "Please select a valid group type to continue",
  }),
  organizationName: z
    .string()
    .min(2, "Please enter your school or organization name")
    .max(200, "Organization name is too long"),
  schoolDistrict: z
    .string()
    .max(200, "School district name is too long")
    .optional()
    .or(z.literal("")),
  organizationAddress: z
    .string()
    .max(500, "Address is too long")
    .optional()
    .or(z.literal("")),
  contactName: z
    .string()
    .min(2, "Please enter the lead teacher or contact's name")
    .max(200, "Name is too long"),
  contactEmail: z
    .string()
    .email("Please enter a valid email address so we can reach you")
    .max(254, "Email address is too long"),
  contactPhone: z
    .string()
    .regex(
      /^(\+1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}$/,
      "Please enter a valid US phone number (e.g., 206-555-1234)"
    ),
  gradeLevels: z
    .array(z.string().max(20))
    .min(1, "Please select at least one grade level for your group")
    .max(10),
  studentCount: z
    .number({
      required_error: "Please enter the number of students joining your visit",
      invalid_type_error: "Please enter the number of students joining your visit",
    })
    .int()
    .min(1, "Your group must include at least one student")
    .max(500, "Please contact us directly for groups over 500 students"),
  adultCount: z
    .number({
      required_error: "Please enter the number of adult chaperones accompanying your group",
      invalid_type_error: "Please enter the number of adult chaperones accompanying your group",
    })
    .int()
    .min(0, "Adult chaperone count cannot be negative")
    .max(100, "Please contact us directly for groups with more than 100 chaperones"),
  visitDate: dateStringSchema,
  arrivalTimeSlot: timeSlotSchema,
  paymentMethod: z.nativeEnum(PaymentMethod, {
    errorMap: () => ({ message: "Please select how you'll be paying for your visit" }),
  }),
  accessibilityNeeds: z
    .string()
    .min(1, "Please let us know about any accessibility needs — select all that apply or enter 'None'")
    .max(2000, "Please keep this under 2,000 characters"),
  cocAcknowledged: z.literal(true, {
    errorMap: () => ({
      message: "Please read and acknowledge the Code of Conduct before submitting",
    }),
  }),
  // Honeypot — must be empty
  website: z.string().max(0).optional(),
  classOfferingId: z.string().uuid().optional(),
  classTimeSlot: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  specialRequests: z.string().max(2000, "Please keep this under 2,000 characters").optional(),
  gradeStudentCounts: z.string().optional(), // JSON map: { "3rd Grade": 20, ... }
  // Scholarship sub-flow (required when paymentMethod === SCHOLARSHIP)
  scholarship: z
    .object({
      titleOneStatus: z.boolean(),
      enrollmentCount: z
        .number({
          required_error: "Please enter your school's total enrollment",
          invalid_type_error: "Please enter your school's total enrollment",
        })
        .int()
        .min(1, "Enrollment must be at least 1")
        .max(10000, "Please contact us directly for schools over 10,000 students"),
      qualifyingInfo: z
        .string()
        .min(1, "Please describe your school's qualifying circumstances")
        .max(2000, "Please keep this under 2,000 characters"),
    })
    .optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const rescheduleBookingSchema = z.object({
  token: z.string().min(1).max(512),
  visitDate: dateStringSchema,
  arrivalTimeSlot: timeSlotSchema,
  classOfferingId: z.string().uuid().optional().nullable(),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const cancelBookingSchema = z.object({
  token: z.string().min(1).max(512),
});

// ─── Admin Booking Filters ────────────────────────────────────────────────────

export const bookingFilterSchema = z
  .object({
    status: z.string().optional(),
    groupType: z.string().optional(),
    paymentMethod: z.string().optional(),
    dateFrom: dateStringSchema.optional(),
    dateTo: dateStringSchema.optional(),
    scholarshipStatus: z.string().optional(),
    search: z.string().max(200).optional(),
  })
  .merge(paginationSchema);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const connectionsLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const magicLinkRequestSchema = z.object({
  email: z.string().email(),
});

// ─── Admin: Booking Management ────────────────────────────────────────────────

export const confirmBookingSchema = z.object({
  internalNotes: z.string().max(5000).optional(),
});

export const declineBookingSchema = z.object({
  reason: z.string().min(10).max(2000),
});

export const updateBookingNotesSchema = z.object({
  internalNotes: z.string().max(5000),
});

// ─── Admin: Scholarship ───────────────────────────────────────────────────────

export const reviewScholarshipSchema = z.object({
  decision: z.enum(["APPROVED", "DENIED"]),
  notes: z.string().max(2000).optional(),
  budgetAllocated: z.number().min(0).max(100000).optional(),
});

// ─── Admin: Class Offering ────────────────────────────────────────────────────

export const classOfferingSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(2000),
  gradeMin: z.number().int().min(0).max(12),
  gradeMax: z.number().int().min(0).max(12),
  durationMinutes: z.number().int().default(60),
  capacity: z.number().int().min(1).max(500),
  resourceRequirements: z.string().max(1000).optional(),
  availableTimeSlots: z.string().optional().nullable(), // JSON array of HH:MM strings
  isActive: z.boolean().default(true),
});

// ─── Admin: Daily Capacity ────────────────────────────────────────────────────

export const dailyCapacitySchema = z.object({
  date: dateStringSchema,
  capacityLimit: z.number().int().min(0).max(10000),
  isBlackout: z.boolean().default(false),
  note: z.string().max(500).optional(),
});

// ─── Admin: Season ────────────────────────────────────────────────────────────

export const seasonSchema = z.object({
  name: z.string().min(2).max(100),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  registrationOpensAt: z.string().datetime(),
  registrationClosesAt: z.string().datetime(),
  defaultDailyCapacity: z.number().int().min(1).max(10000).default(300),
  isPublished: z.boolean().default(false),
});

// ─── Admin: User Management ───────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  role: z.enum(["ADMIN", "REGISTRAR", "CONNECTIONS_COORDINATOR", "READ_ONLY"]),
});

export const updateUserSchema = z.object({
  role: z
    .enum(["ADMIN", "REGISTRAR", "CONNECTIONS_COORDINATOR", "READ_ONLY"])
    .optional(),
  isActive: z.boolean().optional(),
});

// ─── Connections Partner ──────────────────────────────────────────────────────

export const createConnectionsBookingSchema = z.object({
  contactName: z
    .string()
    .min(2, "Please enter your name")
    .max(200, "Name is too long"),
  contactEmail: z
    .string()
    .email("Please enter a valid email address so we can reach you")
    .max(254, "Email address is too long"),
  contactPhone: z
    .string()
    .regex(
      /^(\+1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}$/,
      "Please enter a valid US phone number (e.g., 206-555-1234)"
    ),
  gradeLevels: z
    .array(z.string().max(20))
    .min(1, "Please select at least one grade level for your group")
    .max(10),
  studentCount: z
    .number({
      required_error: "Please enter the number of students joining your visit",
      invalid_type_error: "Please enter the number of students joining your visit",
    })
    .int()
    .min(1, "Your group must include at least one student")
    .max(500, "Please contact us directly for groups over 500 students"),
  adultCount: z
    .number({
      required_error: "Please enter the number of adult chaperones accompanying your group",
      invalid_type_error: "Please enter the number of adult chaperones accompanying your group",
    })
    .int()
    .min(0, "Adult chaperone count cannot be negative")
    .max(100, "Please contact us directly for groups with more than 100 chaperones"),
  visitDate: dateStringSchema,
  arrivalTimeSlot: timeSlotSchema,
  accessibilityNeeds: z
    .string()
    .min(1, "Please let us know about any accessibility needs — select all that apply or enter 'None'")
    .max(2000, "Please keep this under 2,000 characters"),
  specialRequests: z.string().max(2000, "Please keep this under 2,000 characters").optional(),
  cocAcknowledged: z.literal(true, {
    errorMap: () => ({
      message: "Please read and acknowledge the Code of Conduct before submitting",
    }),
  }),
  classOfferingId: z.string().uuid().optional(),
});
