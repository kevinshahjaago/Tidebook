import {
  BookingStatus,
  GroupType,
  PaymentMethod,
  UserRole,
  ScholarshipStatus,
  BusReimbursementStatus,
  EmailTriggerType,
  EmailStatus,
  AuditActorType,
} from "./enums";

// ─── Booking ──────────────────────────────────────────────────────────────────

export interface Booking {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: BookingStatus;
  groupType: GroupType;
  organizationName: string;
  schoolDistrict: string | null;
  addressStreet1: string | null;
  addressStreet2: string | null;
  addressCity: string | null;
  addressState: string;
  addressZip: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  dayOfContactName: string | null;
  dayOfContactPhone: string | null;
  dayOfContactEmail: string | null;
  dayOfContactRole: string | null;
  accessibilityData: string | null;
  transportationReimbursementRequested: boolean;
  gradeLevels: string[];
  gradeStudentCounts: string | null;
  studentCount: number;
  adultCount: number;
  visitDate: string;
  arrivalTimeSlot: string;
  paymentMethod: PaymentMethod;
  acmeOrderNumber: string | null;
  groupNotes: string | null;
  accessibilityNeeds: string | null;
  cocAcknowledged: boolean;
  rescheduleDisabled: boolean;
  confirmedAt: string | null;
  confirmedById: string | null;
  declinedAt: string | null;
  declinedReason: string | null;
  classBookings?: ClassBooking[];
  scholarshipApplication?: ScholarshipApplication | null;
  busReimbursement?: BusReimbursement | null;
}

export interface BookingWithInternalNotes extends Booking {
  internalNotes: string | null;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export interface ClassOffering {
  id: string;
  name: string;
  description: string;
  gradeMin: number;
  gradeMax: number;
  durationMinutes: number;
  capacity: number;
  resourceRequirements: string | null;
  availableTimeSlots: string | null; // JSON array of HH:MM strings
  isActive: boolean;
}

export interface ClassBooking {
  id: string;
  bookingId: string;
  classOfferingId: string;
  sessionSlot: string;
  instructorId: string | null;
  resourceNotes: string | null;
  classOffering?: ClassOffering;
}

// ─── Capacity ─────────────────────────────────────────────────────────────────

export interface DailyCapacityInfo {
  date: string;
  capacityLimit: number;
  confirmedCount: number;
  pendingCount: number;
  remainingCapacity: number;
  isBlackout: boolean;
  note: string | null;
}

export interface AvailabilityCalendarDay extends DailyCapacityInfo {
  isAvailable: boolean;
  isLimitedAvailability: boolean;
  availableTimeSlots: string[];
}

// ─── Season ───────────────────────────────────────────────────────────────────

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  defaultDailyCapacity: number;
  isPublished: boolean;
}

// ─── Scholarship ──────────────────────────────────────────────────────────────

export interface ScholarshipApplication {
  id: string;
  bookingId: string;
  status: ScholarshipStatus;
  titleOneStatus: boolean;
  enrollmentCount: number;
  qualifyingDocumentPath: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  budgetAllocated: number | null;
  scholarshipQualifications: string[];
}

// ─── Bus Reimbursement ────────────────────────────────────────────────────────

export interface BusReimbursement {
  id: string;
  bookingId: string;
  status: BusReimbursementStatus;
  amountRequested: number | null;
  amountApproved: number | null;
  submittedAt: string | null;
  processedAt: string | null;
  busCount: number;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

// ─── Connections Partner ──────────────────────────────────────────────────────

export interface ConnectionsPartner {
  id: string;
  organizationName: string;
  contactName: string;
  contactEmail: string;
  isActive: boolean;
  raisersEdgeId: string | null;
}

// ─── Email Log ────────────────────────────────────────────────────────────────

export interface EmailLog {
  id: string;
  bookingId: string;
  sentAt: string;
  toAddress: string;
  triggerType: EmailTriggerType;
  subject: string;
  status: EmailStatus;
  errorMessage: string | null;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HealthStatus {
  status: "ok" | "degraded";
  timestamp: string;
  database: "connected" | "error";
  acme: "connected" | "error" | "mock";
}
