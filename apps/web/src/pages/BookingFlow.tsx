import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { AvailabilityCalendar } from "../components/AvailabilityCalendar";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  createBookingSchema,
  GroupType,
  PaymentMethod,
  ClassOffering,
  CreateBookingInput,
} from "@tidebook/shared";
import { AlertCircle, Clock } from "lucide-react";
import { AxiosError } from "axios";
import { format, parseISO } from "date-fns";
import ReactMarkdown from "react-markdown";
import HCaptcha from "@hcaptcha/react-hcaptcha";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type GroupTypeOption = { value: string; label: string; description: string };

function formatTimeSlot(time: string): string {
  const [hourStr, min] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour < 12 ? "AM" : "PM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${min} ${period}`;
}

const DEFAULT_GROUP_TYPE_OPTIONS: GroupTypeOption[] = [
  { value: GroupType.SCHOOL,     label: "School Group",       description: "K–12 public and private schools" },
  { value: GroupType.HOMESCHOOL, label: "Home-School Family", description: "Home-school cooperatives and families" },
  { value: GroupType.CORPORATE,  label: "Corporate Group",    description: "Businesses, teams, and professional groups" },
  { value: GroupType.ADHOC,      label: "Ad-Hoc Group",       description: "Clubs, scouts, and other community organizations" },
];

const GRADE_OPTIONS = [
  "Pre-K (ages 0-3)", "Preschool (ages 4+)", "Kindergarten",
  "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade",
  "6th Grade", "7th Grade", "8th Grade",
  "9th Grade", "10th Grade", "11th Grade", "12th Grade",
  "College/University",
];

// College/University groups have no chaperone ratio requirement
const NO_RATIO_GRADES = new Set(["College/University"]);

type PaymentMethodOption = { value: string; label: string; description: string; subtext?: string; emailInstructions: string; isVisible: boolean };

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function BookingFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [accessibilitySelected, setAccessibilitySelected] = useState<string[]>([]);
  const [accessibilityOther, setAccessibilityOther] = useState("");
  // Per-grade student counts for school/homeschool groups: { "3rd Grade": 15, "10th Grade": 20 }
  const [gradeCountMap, setGradeCountMap] = useState<Record<string, number>>({});

  // Slot hold state — tracks temporary capacity reservation while user fills out form
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(0);
  const [holdExpired, setHoldExpired] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdIdRef = useRef<string | null>(null);

  // Day-of-contact: "same as lead" shortcut
  const [dayOfSameAsLead, setDayOfSameAsLead] = useState(false);

  // New accessibility structured state
  const [accessibilityAccommodations, setAccessibilityAccommodations] = useState<string[]>([]);
  const [accessibilityAccommodationsOther, setAccessibilityAccommodationsOther] = useState("");
  const [accessibilityMultilingual, setAccessibilityMultilingual] = useState<string[]>([]);
  const [accessibilityMultilingualOther, setAccessibilityMultilingualOther] = useState("");
  const [accessibilityLanguages, setAccessibilityLanguages] = useState<Record<string, string>>({});

  // Scholarship step state
  const [scholarshipQualifies, setScholarshipQualifies] = useState<boolean | null>(null);
  const [scholarshipQualificationsSelected, setScholarshipQualificationsSelected] = useState<string[]>([]);
  const [transportationRequested, setTransportationRequested] = useState(false);

  // hCaptcha
  const [hcaptchaToken, setHcaptchaToken] = useState<string | null>(null);
  const hcaptchaRef = useRef<any>(null);
  const hcaptchaSiteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

  const form = useForm<CreateBookingInput>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: {
      cocAcknowledged: undefined as any,
      studentCount: undefined as any,
      adultCount: undefined as any,
      gradeLevels: [],
      accessibilityNeeds: undefined,
      accessibilityAccommodations: [],
      accessibilityMultilingual: [],
      transportationReimbursementRequested: false,
      addressState: "WA",
    },
  });

  const { watch, setValue, trigger, formState: { errors } } = form;

  // Release hold on unmount or when booking is complete
  const releaseHold = useCallback((id: string | null) => {
    if (!id) return;
    api.delete(`/public/holds/${id}`).catch(() => {});
  }, []);

  useEffect(() => {
    holdIdRef.current = holdId;
  }, [holdId]);

  // Cleanup hold on unmount
  useEffect(() => {
    return () => {
      releaseHold(holdIdRef.current);
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  // Countdown timer for hold
  useEffect(() => {
    if (!holdExpiresAt) return;
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);

    const tick = () => {
      const remaining = Math.max(0, Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000));
      setHoldSecondsLeft(remaining);
      if (remaining === 0) {
        setHoldExpired(true);
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
      }
    };
    tick();
    holdTimerRef.current = setInterval(tick, 1000);
    return () => { if (holdTimerRef.current) clearInterval(holdTimerRef.current); };
  }, [holdExpiresAt]);

  const startHold = async (visitDate: string, timeSlot: string, groupSize: number): Promise<boolean> => {
    // Release any existing hold first
    if (holdId) { releaseHold(holdId); setHoldId(null); setHoldExpiresAt(null); }
    try {
      const res = await api.post<{ holdId: string; expiresAt: string }>("/public/holds", {
        visitDate, timeSlot, groupSize,
      });
      setHoldId(res.data.holdId);
      holdIdRef.current = res.data.holdId;
      setHoldExpiresAt(new Date(res.data.expiresAt));
      setHoldExpired(false);
      return true;
    } catch {
      return false;
    }
  };

  const groupType = watch("groupType");
  const studentCount = watch("studentCount") || 0;
  const adultCount = watch("adultCount") || 0;
  const visitDate = watch("visitDate");
  const paymentMethod = watch("paymentMethod");
  const gradeLevels = watch("gradeLevels") || [];

  const isSchoolGroup = groupType === GroupType.SCHOOL || groupType === GroupType.HOMESCHOOL;

  // Keep accessibilityNeeds form value in sync with legacy checkbox state (backwards compat)
  React.useEffect(() => {
    const parts = [...accessibilitySelected];
    if (accessibilityOther.trim()) parts.push(`Other: ${accessibilityOther.trim()}`);
    // Only set if no new structured data exists
    if (accessibilityAccommodations.length === 0 && accessibilityMultilingual.length === 0) {
      setValue("accessibilityNeeds", parts.length > 0 ? parts.join(", ") : undefined);
    }
  }, [accessibilitySelected, accessibilityOther]);

  // Sync new accessibility structured state → form values
  React.useEffect(() => {
    setValue("accessibilityAccommodations", accessibilityAccommodations);
    setValue("accessibilityAccommodationsOther", accessibilityAccommodationsOther);
    setValue("accessibilityMultilingual", accessibilityMultilingual);
    setValue("accessibilityMultilingualOther", accessibilityMultilingualOther);
    setValue("accessibilityLanguages", accessibilityLanguages);
  }, [accessibilityAccommodations, accessibilityAccommodationsOther, accessibilityMultilingual, accessibilityMultilingualOther, accessibilityLanguages]);

  // Sync scholarship state → form values
  React.useEffect(() => {
    setValue("scholarshipQualifies", scholarshipQualifies ?? undefined);
    setValue("scholarshipQualifications", scholarshipQualificationsSelected);
    setValue("transportationReimbursementRequested", transportationRequested);
  }, [scholarshipQualifies, scholarshipQualificationsSelected, transportationRequested]);

  // Sync per-grade counts → form fields (school/homeschool only)
  React.useEffect(() => {
    if (!isSchoolGroup) return;
    const selectedGrades = Object.keys(gradeCountMap);
    const total = Object.values(gradeCountMap).reduce((s, n) => s + n, 0);
    setValue("gradeLevels", selectedGrades);
    setValue("studentCount", total > 0 ? total : (undefined as any));
    (setValue as any)("gradeStudentCounts", JSON.stringify(gradeCountMap));
  }, [gradeCountMap, isSchoolGroup]);

  // "Same as lead" effect — copy lead contact info to day-of fields
  const contactName = watch("contactName");
  const contactPhone = watch("contactPhone");
  const contactEmail = watch("contactEmail");
  React.useEffect(() => {
    if (dayOfSameAsLead) {
      setValue("dayOfContactName", contactName || "");
      setValue("dayOfContactPhone", contactPhone || "");
      setValue("dayOfContactEmail", contactEmail || "");
    }
  }, [dayOfSameAsLead, contactName, contactPhone, contactEmail]);

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => api.get<{ settings: Record<string, string> }>("/public/settings").then((r) => r.data.settings),
    staleTime: 60 * 60_000,
  });

  const s = (key: string, fallback: string) => publicSettings?.[key] ?? fallback;

  const LOWER_GRADES = new Set([
    "Pre-K (ages 0-3)", "Preschool (ages 4+)", "Kindergarten",
    "1st Grade", "2nd Grade", "3rd Grade",
    "4th Grade", "5th Grade", "6th Grade", "7th Grade", "8th Grade",
  ]);

  const ratioLower = parseInt(s("chaperone_ratio_lower_grades", "5"));
  const ratioUpper = parseInt(s("chaperone_ratio_upper_grades", "10"));
  const ratioDefault = parseInt(s("chaperone_ratio_default", "5"));

  const lowerGradeStudents = Object.entries(gradeCountMap)
    .filter(([g]) => LOWER_GRADES.has(g))
    .reduce((s, [, n]) => s + n, 0);
  const upperGradeStudents = Object.entries(gradeCountMap)
    .filter(([g]) => !LOWER_GRADES.has(g) && !NO_RATIO_GRADES.has(g))
    .reduce((s, [, n]) => s + n, 0);

  const minChaperones = isSchoolGroup
    ? (lowerGradeStudents > 0 ? Math.ceil(lowerGradeStudents / ratioLower) : 0) +
      (upperGradeStudents > 0 ? Math.ceil(upperGradeStudents / ratioUpper) : 0)
    : studentCount > 0 ? Math.ceil(studentCount / ratioDefault) : 0;

  const chaperoneShortfall = Math.max(0, minChaperones - (adultCount || 0));

  const groupTypeOptions: GroupTypeOption[] = (() => {
    try { return JSON.parse(s("group_type_options", "[]")); } catch { return DEFAULT_GROUP_TYPE_OPTIONS; }
  })();

  const paymentMethodOptions: PaymentMethodOption[] = (() => {
    try {
      const all: PaymentMethodOption[] = JSON.parse(s("payment_method_options", "[]"));
      return all.filter((o) => o.isVisible !== false);
    } catch {
      return [
        { value: "CASH_OR_CHECK",       label: "Cash or Check (day of visit)",              description: "We accept cash and checks payable to 'Seattle Aquarium'.", subtext: "", emailInstructions: "", isVisible: true },
        { value: "CREDIT_DEBIT",        label: "Credit or Debit Card (via call/in-person)", description: "Call us to pay by card, or pay at the ticket window.",        subtext: "", emailInstructions: "", isVisible: true },
        { value: "ONLINE_PAYMENT_LINK", label: "Online Payment Link",                       description: "We will send you a secure payment link by email.",            subtext: "", emailInstructions: "", isVisible: true },
        { value: "INVOICE",             label: "Purchase Order / Invoice",                  description: "For organizations that pay by purchase order or invoice.",    subtext: "", emailInstructions: "", isVisible: true },
        { value: "SCHOLARSHIP",         label: "Applying for a Scholarship",                description: "For Title I schools and qualifying organizations.",           subtext: "", emailInstructions: "", isVisible: true },
      ];
    }
  })();

  const accessibilityOptions: string[] = (() => {
    try { return JSON.parse(s("accessibility_options", "[]")); } catch { return []; }
  })();

  const accessibilityAccommodationsOptions: string[] = (() => {
    try { return JSON.parse(s("accessibility_accommodations_options", "[]")); } catch { return ["Private/quiet space", "High-capacity adult-sized changing table", "Tactile sensory tour", "Other"]; }
  })();

  const accessibilityMultilingualOptions: string[] = (() => {
    try { return JSON.parse(s("accessibility_multilingual_options", "[]")); } catch { return ["Field guides with Puget Sound organisms", "Translators to stay with the group throughout visit", "Scavenger hunt", "Other"]; }
  })();

  const accessibilityMultilingualLanguages: string[] = (() => {
    try { return JSON.parse(s("accessibility_multilingual_languages", "[]")); } catch { return ["Spanish", "Mandarin Chinese", "Vietnamese", "Somali", "Tagalog", "Korean", "Russian", "Arabic", "Amharic", "Other"]; }
  })();

  const scholarshipQualificationOptions: string[] = (() => {
    try { return JSON.parse(s("scholarship_qualifications", "[]")); } catch { return ["Title I school designation", "Free or reduced lunch program participation (>50%)", "Community-based organization serving low-income families", "Foster care agency or residential program", "Other qualifying circumstance (please describe in special requests)"]; }
  })();

  const transportationReimbEnabled = s("transportation_reimbursement_enabled", "false") === "true";

  const cocUrl = s("code_of_conduct_url", "https://seattleaquarium.org/wp-content/uploads/2024/09/Seattle-Aquarium-Field-Trip-Code-of-Conduct-2024-25.pdf");
  const formSubtitle = s("booking_form_subtitle", "School & Public Programs — Group Visit Registration");
  const connectionsNotice = s("booking_connections_notice", "Connections Partners (nonprofits, YMCAs, community centers) should use the Connections Partner portal.");
  const classStepDescription = s("booking_class_step_description", "Enhance your visit with a facilitated 60-minute program led by our education staff.");
  const cocPrefix = s("booking_coc_prefix", "I have read and agree to the ");
  const cocLinkLabel = s("booking_coc_link_label", "Code of Conduct");
  const cocSuffix = s("booking_coc_suffix", " and confirm I will review it with my group before the visit.");

  const { data: classesData } = useQuery({
    queryKey: ["public-classes"],
    queryFn: () => api.get<{ classes: ClassOffering[] }>("/public/classes").then((r) => r.data.classes),
    staleTime: 5 * 60_000,
  });

  const arrivalTimeSlot = watch("arrivalTimeSlot");

  const { data: classAvailability } = useQuery({
    queryKey: ["class-availability", visitDate, arrivalTimeSlot],
    queryFn: () =>
      api.get<{ availability: Array<{ classOfferingId: string; availableSlots: string[] }> }>(
        "/public/classes/availability",
        { params: { date: visitDate, arrivalTimeSlot } }
      ).then((r) => r.data.availability),
    enabled: !!visitDate && !!arrivalTimeSlot && step === 7,
    staleTime: 60_000,
  });

  const { data: timeSlotsData } = useQuery({
    queryKey: ["time-slots"],
    queryFn: () =>
      api.get<{ calendar: unknown[]; timeSlots: string[] }>("/public/availability", {
        params: { startDate: visitDate, endDate: visitDate, groupSize: 1 },
      }).then((r) => r.data.timeSlots),
    enabled: !!visitDate,
  });

  const createBookingMutation = useMutation({
    mutationFn: (data: CreateBookingInput) =>
      api.post<{ bookingId: string; status: string; rescheduleToken: string }>("/public/bookings", data),
    onSuccess: (res) => {
      // Hold is consumed by the booking — release it client-side to free any server reference
      releaseHold(holdIdRef.current);
      setHoldId(null);
      setHoldExpiresAt(null);
      navigate("/booking/confirmation", {
        state: {
          bookingId: res.data.bookingId,
          status: res.data.status,
          visitDate: form.getValues("visitDate"),
          arrivalTimeSlot: form.getValues("arrivalTimeSlot"),
          rescheduleToken: res.data.rescheduleToken,
        },
      });
    },
  });

  const groupSize = (studentCount || 0) + (adultCount || 0);

  const [clientValidationError, setClientValidationError] = React.useState<string | null>(null);

  const onSubmit = form.handleSubmit(
    (data) => {
      setClientValidationError(null);
      // Attach hcaptcha token if available
      const submitData = hcaptchaToken ? { ...data, hcaptchaToken } : data;
      createBookingMutation.mutate(submitData);
    },
    (errors) => {
      const firstMsg = Object.values(errors).map((e: any) => e?.message).find(Boolean);
      setClientValidationError(firstMsg ?? "Please review your answers — one or more fields are incomplete.");
    }
  );

  const serverErrorObj = (createBookingMutation.error as AxiosError<any>)?.response?.data?.error;
  const serverError: string | null = serverErrorObj
    ? (typeof serverErrorObj === "string" ? serverErrorObj : serverErrorObj?.message ?? "An unexpected error occurred.")
    : null;

  const portalEnabled = publicSettings ? (publicSettings["booking_portal_enabled"] !== "false") : true;
  const portalClosedMessage = s("booking_portal_closed_message", "Online registration is not currently open. Please check back soon or contact us directly to schedule your visit.");

  const holdMins = Math.floor(holdSecondsLeft / 60);
  const holdSecs = holdSecondsLeft % 60;
  const holdTimerDisplay = `${holdMins}:${holdSecs.toString().padStart(2, "0")}`;

  return (
    <ErrorBoundary>
      <div className="min-h-screen py-8 px-4" style={{ background: "linear-gradient(160deg, #071929 0%, #103A69 55%, #1A63B0 100%)" }}>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-4 mb-3">
              <img src="/sa-logo.png" alt="Seattle Aquarium" className="h-16 w-auto object-contain drop-shadow-md" style={{ filter: "brightness(0) invert(1)" }} />
            </div>
            <p className="text-aqua-200 text-sm font-medium">{formSubtitle}</p>
          </div>

          {/* Portal closed banner */}
          {!portalEnabled && (
            <div className="card text-center py-10">
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Registration Not Open</h2>
              <p className="text-gray-600 max-w-md mx-auto">{portalClosedMessage}</p>
            </div>
          )}

          {/* Slot hold expired overlay */}
          {holdExpired && step > 1 && (
            <div className="card text-center py-8 mb-4 border-2 border-amber-300 bg-amber-50">
              <Clock className="h-10 w-10 text-amber-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-amber-900 mb-2">Your slot reservation has expired</h3>
              <p className="text-sm text-amber-800 mb-4">Your date and time were held while you filled out the form, but the reservation has timed out. Please go back and re-select your date and arrival time.</p>
              <button
                onClick={() => {
                  setHoldId(null);
                  setHoldExpiresAt(null);
                  setHoldExpired(false);
                  setValue("visitDate", undefined as any);
                  setValue("arrivalTimeSlot", undefined as any);
                  setStep(2);
                }}
                className="btn-primary"
              >
                Re-select Date & Time
              </button>
            </div>
          )}


          {/* Step progress — only shown when portal is open */}
          {portalEnabled && (
          <>
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  s === step ? "w-8 bg-white" : s < step ? "w-4 bg-aqua-300" : "w-4 bg-aqua-600"
                }`}
              />
            ))}
          </div>

          {/* Slot hold countdown banner — shown from step 3 onwards */}
          {holdExpiresAt && !holdExpired && step >= 3 && step < 8 && (
            <div className={`flex items-center gap-3 rounded-lg px-4 py-3 mb-4 text-sm ${
              holdSecondsLeft <= 120 ? "bg-amber-100 border border-amber-300 text-amber-900" : "bg-aqua-900/80 border border-aqua-600 text-white"
            }`}>
              <Clock className={`h-4 w-4 shrink-0 ${holdSecondsLeft <= 120 ? "text-amber-600" : "text-aqua-300"}`} />
              <span>
                {(() => {
                  const template = s("booking_slot_hold_banner", "Your slot for {time} arrival on {date} is reserved for {timer}");
                  const rawDate = watch("visitDate");
                  const formattedDate = rawDate ? format(parseISO(rawDate), "EEEE, MMMM d, yyyy") : "";
                  const formattedTime = formatTimeSlot(watch("arrivalTimeSlot") || "");
                  const parts = template.split(/(\{time\}|\{date\}|\{timer\})/);
                  return parts.map((part, i) => {
                    if (part === "{time}") return <strong key={i}>{formattedTime}</strong>;
                    if (part === "{date}") return <strong key={i}>{formattedDate}</strong>;
                    if (part === "{timer}") return (
                      <span key={i} className={`font-mono font-semibold ${holdSecondsLeft <= 120 ? "text-amber-700" : "text-white"}`}>{holdTimerDisplay}</span>
                    );
                    return part;
                  });
                })()}
                {holdSecondsLeft <= 120 && " — please submit soon!"}
              </span>
            </div>
          )}

          <div className="card">
            {/* Step 1: Group Type */}
            {step === 1 && portalEnabled && (
              <div>
                <h2 className="text-xl font-semibold mb-2">What type of group are you bringing?</h2>
                <p className="text-gray-600 text-sm mb-6">
                  {connectionsNotice}{" "}
                  <a href="/connections" className="text-aqua-700 underline">Sign in here</a>.
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {groupTypeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setValue("groupType", opt.value as any);
                        setStep(2);
                      }}
                      className={`p-4 text-left rounded-lg border-2 transition-colors ${
                        groupType === opt.value
                          ? "border-aqua-700 bg-aqua-50"
                          : "border-gray-200 hover:border-aqua-400"
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      {opt.description && <p className="text-sm text-gray-500 mt-0.5">{opt.description}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Group Size & Date */}
            {step === 2 && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Choose a Visit Date</h2>
                <p className="text-gray-600 text-sm mb-6">
                  {isSchoolGroup
                    ? "Start by telling us your grade levels — we use this to calculate the required chaperone ratio."
                    : "Enter your group size to see available dates."}
                </p>

                {/* School/homeschool: per-grade student counts */}
                {isSchoolGroup && (
                  <div className="mb-6">
                    <label className="label mb-1">Students by grade (required)</label>
                    <p className="text-xs text-gray-500 mb-3">
                      Check each grade in your group and enter the number of students. We'll calculate the chaperone requirement for you.
                    </p>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
                        <span />
                        <span>Grade</span>
                        <span className="w-20 sm:w-24 text-right">Students</span>
                        <span className="hidden sm:block w-40 text-right pr-1">Chaperone:Student Ratio</span>
                      </div>
                      {GRADE_OPTIONS.map((grade) => {
                        const isChecked = grade in gradeCountMap;
                        const isLower = LOWER_GRADES.has(grade);
                        const isNoRatio = NO_RATIO_GRADES.has(grade);
                        return (
                          <div
                            key={grade}
                            className={`grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 px-3 py-2 border-b border-gray-100 last:border-0 ${isChecked ? "bg-white" : "bg-gray-50"}`}
                          >
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-aqua-700"
                              checked={isChecked}
                              onChange={(e) => {
                                setGradeCountMap((prev) => {
                                  const next = { ...prev };
                                  if (e.target.checked) { next[grade] = 0; }
                                  else { delete next[grade]; }
                                  return next;
                                });
                              }}
                            />
                            <span className={`text-sm ${isChecked ? "text-gray-900 font-medium" : "text-gray-500"}`}>{grade}</span>
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              disabled={!isChecked}
                              className={`input text-sm w-20 sm:w-24 text-right ${!isChecked ? "opacity-30 pointer-events-none" : ""}`}
                              value={isChecked ? (gradeCountMap[grade] || "") : ""}
                              placeholder="0"
                              onWheel={(e) => e.currentTarget.blur()}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setGradeCountMap((prev) => ({ ...prev, [grade]: val }));
                              }}
                            />
                            <span className={`hidden sm:block text-xs w-40 text-right pr-1 ${isChecked ? (isNoRatio ? "text-gray-500" : isLower ? "text-amber-700" : "text-blue-700") : "text-gray-300"}`}>
                              {isNoRatio ? "No ratio required" : `1 per ${isLower ? ratioLower : ratioUpper} students`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {errors.gradeLevels && <p className="error-message mt-2">{errors.gradeLevels.message}</p>}
                    {errors.studentCount && <p className="error-message">{errors.studentCount.message}</p>}

                    {/* Running totals */}
                    {(() => {
                      const collegeStudents = Object.entries(gradeCountMap)
                        .filter(([g]) => NO_RATIO_GRADES.has(g))
                        .reduce((s, [, n]) => s + n, 0);
                      const totalStudents = lowerGradeStudents + upperGradeStudents + collegeStudents;
                      return totalStudents > 0 ? (
                        <div className="mt-3 rounded-lg bg-aqua-50 border border-aqua-200 p-3 text-sm space-y-1">
                          {lowerGradeStudents > 0 && (
                            <div className="flex justify-between text-amber-800">
                              <span>Pre-K / Preschool – 8th grade ({lowerGradeStudents} students)</span>
                              <span className="font-medium">→ {Math.ceil(lowerGradeStudents / ratioLower)} chaperone{Math.ceil(lowerGradeStudents / ratioLower) !== 1 ? "s" : ""}</span>
                            </div>
                          )}
                          {upperGradeStudents > 0 && (
                            <div className="flex justify-between text-blue-800">
                              <span>9th – 12th grade ({upperGradeStudents} students)</span>
                              <span className="font-medium">→ {Math.ceil(upperGradeStudents / ratioUpper)} chaperone{Math.ceil(upperGradeStudents / ratioUpper) !== 1 ? "s" : ""}</span>
                            </div>
                          )}
                          {collegeStudents > 0 && (
                            <div className="flex justify-between text-gray-600">
                              <span>College/University ({collegeStudents} students)</span>
                              <span className="font-medium">No ratio required</span>
                            </div>
                          )}
                          <div className="flex justify-between font-semibold text-aqua-900 pt-1 border-t border-aqua-200">
                            <span>Total: {totalStudents} students</span>
                            <span>{minChaperones} chaperone{minChaperones !== 1 ? "s" : ""} required</span>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Non-school: single student count */}
                {!isSchoolGroup && (
                  <div className="mb-4 max-w-xs">
                    <label className="label">Number of students (required)</label>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      className={`input ${errors.studentCount ? "input-error" : ""}`}
                      onWheel={(e) => e.currentTarget.blur()}
                      {...form.register("studentCount", { valueAsNumber: true })}
                    />
                    {errors.studentCount && <p className="error-message">{errors.studentCount.message}</p>}
                  </div>
                )}

                {/* Chaperone count */}
                <div className={`mb-6 ${isSchoolGroup ? "" : "grid grid-cols-2 gap-4"}`}>
                  <div className={isSchoolGroup ? "" : ""}>
                    <label className="label">Number of adult chaperones (required)</label>
                    {minChaperones > 0 && (
                      <p className="text-xs text-gray-500 mb-1">
                        At least <strong>{minChaperones}</strong> required for your group
                      </p>
                    )}
                    <input
                      type="number"
                      min="0"
                      className={`input ${errors.adultCount ? "input-error" : ""} ${isSchoolGroup ? "max-w-xs" : ""}`}
                      onWheel={(e) => e.currentTarget.blur()}
                      {...form.register("adultCount", { valueAsNumber: true })}
                    />
                    {errors.adultCount && <p className="error-message">{errors.adultCount.message}</p>}
                  </div>
                </div>

                {/* Chaperone shortfall warning */}
                {chaperoneShortfall > 0 && (
                  <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                    Your group needs at least <strong>{minChaperones} adult chaperone{minChaperones !== 1 ? "s" : ""}</strong>. Please plan to bring {chaperoneShortfall} more.
                  </div>
                )}

                <AvailabilityCalendar
                  groupSize={groupSize || 1}
                  selectedDate={visitDate || null}
                  onDateSelect={(d) => setValue("visitDate", d)}
                />
                {errors.visitDate && <p className="error-message mt-2">{errors.visitDate.message}</p>}

                {visitDate && (
                  <div className="mt-6">
                    <label className="label">Arrival Time (required)</label>
                    <select
                      className={`input ${errors.arrivalTimeSlot ? "input-error" : ""}`}
                      {...form.register("arrivalTimeSlot")}
                    >
                      <option value="">Select arrival time…</option>
                      {timeSlotsData?.map((slot) => (
                        <option key={slot} value={slot}>{formatTimeSlot(slot)}</option>
                      ))}
                    </select>
                    {errors.arrivalTimeSlot && (
                      <p className="error-message">{errors.arrivalTimeSlot.message}</p>
                    )}
                  </div>
                )}

                {s("booking_contact_footer", "") && (
                  <div className="mt-6 text-xs text-gray-400 text-center prose prose-xs max-w-none [&_a]:text-aqua-600">
                    <ReactMarkdown>{s("booking_contact_footer", "")}</ReactMarkdown>
                  </div>
                )}

                <div className="flex justify-between mt-4">
                  <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
                  <button
                    onClick={async () => {
                      const fieldsToValidate: Parameters<typeof trigger>[0] = [
                        "studentCount", "adultCount", "visitDate", "arrivalTimeSlot",
                        "gradeLevels",
                      ];
                      const valid = await trigger(fieldsToValidate);
                      if (!valid) return;
                      if (chaperoneShortfall > 0) {
                        form.setError("adultCount", {
                          message: `Your group needs at least ${minChaperones} adult chaperone${minChaperones !== 1 ? "s" : ""}. Please plan to bring ${chaperoneShortfall} more.`,
                        });
                        return;
                      }
                      // Create slot hold before advancing
                      const held = await startHold(
                        form.getValues("visitDate"),
                        form.getValues("arrivalTimeSlot"),
                        (form.getValues("studentCount") || 0) + (form.getValues("adultCount") || 0) || 1
                      );
                      if (!held) {
                        form.setError("arrivalTimeSlot", { message: "This time slot is no longer available. Please select another." });
                        return;
                      }
                      setStep(3);
                    }}
                    className="btn-primary"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Contact & Group Info */}
            {step === 3 && (
              <div>
                <h2 className="text-xl font-semibold mb-6">Tell us about your group</h2>
                <div className="space-y-4">
                  <div>
                    <label className="label">School / Organization Name (required)</label>
                    <input className={`input ${errors.organizationName ? "input-error" : ""}`} {...form.register("organizationName")} />
                    {errors.organizationName && <p className="error-message">{errors.organizationName.message}</p>}
                  </div>
                  <div>
                    <label className="label">School District</label>
                    <input className="input" {...form.register("schoolDistrict")} />
                    <p className="text-xs text-gray-500 mt-1">{s("booking_school_district_hint", "Enter N/A for private schools, home schools, & colleges/universities.")}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="label">
                      School / Organization Address{groupType !== GroupType.HOMESCHOOL ? " (required)" : ""}
                    </label>
                    <input
                      className={`input ${errors.addressStreet1 ? "input-error" : ""}`}
                      placeholder="Street address"
                      {...form.register("addressStreet1")}
                    />
                    {errors.addressStreet1 && <p className="error-message">{errors.addressStreet1.message}</p>}
                    <input className="input" placeholder="Apt, Suite, Bldg (optional)" {...form.register("addressStreet2")} />
                    <div className="grid grid-cols-2 sm:grid-cols-[1fr_80px_100px] gap-2">
                      <input
                        className={`input col-span-2 sm:col-span-1 ${errors.addressCity ? "input-error" : ""}`}
                        placeholder="City"
                        {...form.register("addressCity")}
                      />
                      <input className="input uppercase" maxLength={2} placeholder="State" {...form.register("addressState")} />
                      <input
                        className={`input ${errors.addressZip ? "input-error" : ""}`}
                        placeholder="ZIP"
                        {...form.register("addressZip")}
                      />
                    </div>
                    {(errors.addressCity || errors.addressZip) && (
                      <p className="error-message">{errors.addressCity?.message ?? errors.addressZip?.message}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Lead Teacher / Contact Name (required)</label>
                      <input className={`input ${errors.contactName ? "input-error" : ""}`} {...form.register("contactName")} />
                      {errors.contactName && <p className="error-message">{errors.contactName.message}</p>}
                    </div>
                    <div>
                      <label className="label">Direct Phone (required)</label>
                      <input
                        type="tel"
                        inputMode="tel"
                        placeholder="(206) 555-1234"
                        className={`input ${errors.contactPhone ? "input-error" : ""}`}
                        {...(() => {
                          const { onChange, ...rest } = form.register("contactPhone");
                          return {
                            ...rest,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = formatPhone(e.target.value);
                              onChange(e);
                            },
                          };
                        })()}
                      />
                      {errors.contactPhone && <p className="error-message">{errors.contactPhone.message}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="label">Email Address (required)</label>
                    <input type="email" className={`input ${errors.contactEmail ? "input-error" : ""}`} {...form.register("contactEmail")} />
                    {errors.contactEmail && <p className="error-message">{errors.contactEmail.message}</p>}
                  </div>

                  {/* Day-of-visit contact */}
                  <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-800">Day-of-Visit Contact</h3>
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-aqua-700"
                          checked={dayOfSameAsLead}
                          onChange={(e) => setDayOfSameAsLead(e.target.checked)}
                        />
                        Same as lead contact
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label text-xs">Name</label>
                        <input
                          className="input"
                          placeholder="If different from lead contact"
                          disabled={dayOfSameAsLead}
                          {...form.register("dayOfContactName")}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Phone</label>
                        <input
                          type="tel"
                          inputMode="tel"
                          placeholder="(206) 555-1234"
                          className={`input ${errors.dayOfContactPhone ? "input-error" : ""}`}
                          disabled={dayOfSameAsLead}
                          {...(() => {
                            const { onChange, ...rest } = form.register("dayOfContactPhone");
                            return {
                              ...rest,
                              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                e.target.value = formatPhone(e.target.value);
                                onChange(e);
                              },
                            };
                          })()}
                        />
                        {errors.dayOfContactPhone && <p className="error-message">{errors.dayOfContactPhone.message}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label text-xs">Email</label>
                        <input
                          type="email"
                          className={`input ${errors.dayOfContactEmail ? "input-error" : ""}`}
                          placeholder="day-of email (optional)"
                          disabled={dayOfSameAsLead}
                          {...form.register("dayOfContactEmail")}
                        />
                        {errors.dayOfContactEmail && <p className="error-message">{errors.dayOfContactEmail.message}</p>}
                      </div>
                      <div>
                        <label className="label text-xs">Role / Title</label>
                        <input
                          className="input"
                          placeholder="e.g. Chaperone Lead, Teacher"
                          {...form.register("dayOfContactRole")}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grade levels only shown for non-school groups — school/homeschool collect this in step 2 */}
                  {!isSchoolGroup && (
                    <div>
                      <label className="label">Grade Level(s) (required)</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                        {GRADE_OPTIONS.map((grade) => (
                          <label key={grade} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              value={grade}
                              className="rounded border-gray-300 text-aqua-700"
                              {...form.register("gradeLevels")}
                            />
                            {grade}
                          </label>
                        ))}
                      </div>
                      {errors.gradeLevels && <p className="error-message">{errors.gradeLevels.message}</p>}
                    </div>
                  )}

                  {/* Optional group notes */}
                  <div>
                    <label className="label">Is there anything else you would like us to know about your group? <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea
                      rows={3}
                      className="input"
                      placeholder="Anything that will help us prepare for your visit"
                      {...form.register("groupNotes")}
                    />
                  </div>

                  {/* Contact footer */}
                  {s("booking_contact_footer", "") && (
                    <div className="text-xs text-gray-400 text-center pt-2 prose prose-xs max-w-none [&_a]:text-aqua-600">
                      <ReactMarkdown>{s("booking_contact_footer", "")}</ReactMarkdown>
                    </div>
                  )}

                  {/* Honeypot — hidden from real users */}
                  <input type="text" className="hidden" tabIndex={-1} autoComplete="off" {...form.register("website")} />
                </div>
                <div className="flex justify-between mt-6">
                  <button onClick={() => setStep(2)} className="btn-secondary">Back</button>
                  <button
                    onClick={async () => {
                      const fieldsToValidate: Parameters<typeof trigger>[0] = [
                        "organizationName", "contactName", "contactPhone", "contactEmail",
                        "dayOfContactPhone", "dayOfContactEmail",
                        "addressStreet1", "addressCity", "addressZip",
                        ...(!isSchoolGroup ? (["gradeLevels"] as any) : []),
                        ...(paymentMethod === PaymentMethod.SCHOLARSHIP
                          ? (["scholarship.enrollmentCount", "scholarship.qualifyingInfo"] as any)
                          : []),
                      ];
                      const valid = await trigger(fieldsToValidate);
                      if (valid) setStep(4);  // → Accessibility
                    }}
                    className="btn-primary"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Accessibility & Multilingual Support */}
            {step === 4 && (
              <div>
                <h2 className="text-xl font-semibold mb-2">{s("accessibility_intro_header", "Accessibility & Multilingual Support")}</h2>
                {s("accessibility_intro_body", "") && (
                  <div className="text-gray-600 text-sm mb-6 prose prose-sm max-w-none">
                    <ReactMarkdown>{s("accessibility_intro_body", "")}</ReactMarkdown>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Accommodations question */}
                  <div>
                    <label className="label">{s("accessibility_accommodations_question", "Which of these accommodations would be helpful for any of your students?")}</label>
                    <div className="space-y-1.5 mt-2">
                      {accessibilityAccommodationsOptions.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-aqua-700"
                            checked={accessibilityAccommodations.includes(opt)}
                            onChange={(e) => {
                              setAccessibilityAccommodations((prev) =>
                                e.target.checked ? [...prev, opt] : prev.filter((v) => v !== opt)
                              );
                              // Clear language for this item if unchecked
                              if (!e.target.checked) {
                                setAccessibilityLanguages((prev) => {
                                  const next = { ...prev };
                                  delete next[opt];
                                  return next;
                                });
                              }
                            }}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                    {accessibilityAccommodations.includes("Other") && (
                      <div className="mt-2 ml-6">
                        <input
                          className={`input text-sm w-full ${errors.accessibilityAccommodationsOther ? "input-error" : ""}`}
                          placeholder="Please describe the accommodation needed"
                          value={accessibilityAccommodationsOther}
                          onChange={(e) => setAccessibilityAccommodationsOther(e.target.value)}
                          autoFocus
                        />
                        {errors.accessibilityAccommodationsOther && (
                          <p className="error-message">{errors.accessibilityAccommodationsOther.message}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Multilingual question */}
                  <div>
                    <label className="label">{s("accessibility_multilingual_question", "Which of these accommodations are needed for multi-lingual support?")}</label>
                    <div className="space-y-1.5 mt-2">
                      {accessibilityMultilingualOptions.map((opt) => (
                        <div key={opt}>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-aqua-700"
                              checked={accessibilityMultilingual.includes(opt)}
                              onChange={(e) => {
                                setAccessibilityMultilingual((prev) =>
                                  e.target.checked ? [...prev, opt] : prev.filter((v) => v !== opt)
                                );
                                if (!e.target.checked) {
                                  setAccessibilityLanguages((prev) => {
                                    const next = { ...prev };
                                    delete next[opt];
                                    return next;
                                  });
                                }
                              }}
                            />
                            {opt}
                          </label>
                          {/* Language selector for this multilingual item */}
                          {accessibilityMultilingual.includes(opt) && opt !== "Other" && (
                            <div className="mt-1 ml-6">
                              <select
                                className="input text-sm"
                                value={accessibilityLanguages[opt] ?? ""}
                                onChange={(e) => {
                                  setAccessibilityLanguages((prev) => ({ ...prev, [opt]: e.target.value }));
                                }}
                              >
                                <option value="">Select language…</option>
                                {accessibilityMultilingualLanguages.map((lang) => (
                                  <option key={lang} value={lang}>{lang}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {accessibilityMultilingual.includes("Other") && (
                      <div className="mt-2 ml-6">
                        <input
                          className={`input text-sm w-full ${errors.accessibilityMultilingualOther ? "input-error" : ""}`}
                          placeholder="Please describe the multilingual support needed"
                          value={accessibilityMultilingualOther}
                          onChange={(e) => setAccessibilityMultilingualOther(e.target.value)}
                        />
                        {errors.accessibilityMultilingualOther && (
                          <p className="error-message">{errors.accessibilityMultilingualOther.message}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Legacy accessibility options (from old settings key) */}
                  {accessibilityOptions.length > 0 && (
                    <div>
                      <label className="label">Additional Accessibility & Accommodation Needs</label>
                      <p className="text-xs text-gray-500 mb-2">Select all that apply for your group.</p>
                      <div className="space-y-1.5">
                        {accessibilityOptions.map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              value={opt}
                              className="rounded border-gray-300 text-aqua-700"
                              checked={accessibilitySelected.includes(opt)}
                              onChange={(e) => {
                                setAccessibilitySelected((prev) =>
                                  e.target.checked ? [...prev, opt] : prev.filter((v) => v !== opt)
                                );
                              }}
                            />
                            {opt}
                          </label>
                        ))}
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-aqua-700"
                            checked={accessibilityOther !== ""}
                            onChange={(e) => setAccessibilityOther(e.target.checked ? " " : "")}
                          />
                          Other (please describe)
                        </label>
                        {accessibilityOther !== "" && (
                          <input
                            className="input text-sm mt-1 w-full ml-6"
                            placeholder="Please describe any other needs"
                            value={accessibilityOther.trim()}
                            onChange={(e) => setAccessibilityOther(e.target.value)}
                            autoFocus
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Subtext */}
                  {s("accessibility_subtext", "") && (
                    <p className="text-xs text-gray-500 italic">{s("accessibility_subtext", "")}</p>
                  )}
                </div>

                <div className="flex justify-between mt-6">
                  <button onClick={() => setStep(3)} className="btn-secondary">Back</button>
                  <button
                    onClick={async () => {
                      const fieldsToValidate: Parameters<typeof trigger>[0] = [
                        ...(accessibilityAccommodations.includes("Other") ? (["accessibilityAccommodationsOther"] as any) : []),
                        ...(accessibilityMultilingual.includes("Other") ? (["accessibilityMultilingualOther"] as any) : []),
                      ];
                      const valid = fieldsToValidate.length > 0 ? await trigger(fieldsToValidate) : true;
                      if (valid) setStep(5);
                    }}
                    className="btn-primary"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Scholarship Eligibility */}
            {step === 5 && (
              <div>
                <h2 className="text-xl font-semibold mb-2">{s("scholarship_header", "Scholarship Eligibility")}</h2>
                {s("scholarship_requirements_body", "") && (
                  <div className="text-gray-600 text-sm mb-6 prose prose-sm max-w-none">
                    <ReactMarkdown>{s("scholarship_requirements_body", "")}</ReactMarkdown>
                  </div>
                )}

                <div className="space-y-5">
                  {/* Yes/No question */}
                  <div>
                    <p className="label">Do you believe your group qualifies for a free admission scholarship?</p>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="scholarshipQualifies"
                          value="yes"
                          checked={scholarshipQualifies === true}
                          onChange={() => setScholarshipQualifies(true)}
                          className="text-aqua-700"
                        />
                        Yes
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="scholarshipQualifies"
                          value="no"
                          checked={scholarshipQualifies === false}
                          onChange={() => {
                            setScholarshipQualifies(false);
                            setScholarshipQualificationsSelected([]);
                          }}
                          className="text-aqua-700"
                        />
                        No
                      </label>
                    </div>
                  </div>

                  {/* Qualification checklist — shown when "Yes" selected */}
                  {scholarshipQualifies === true && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-medium text-amber-900">{s("scholarship_qualification_question", "Please select all criteria that apply to your group:")}</p>
                      <div className="space-y-1.5">
                        {scholarshipQualificationOptions.map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-aqua-700"
                              checked={scholarshipQualificationsSelected.includes(opt)}
                              onChange={(e) => {
                                setScholarshipQualificationsSelected((prev) =>
                                  e.target.checked ? [...prev, opt] : prev.filter((v) => v !== opt)
                                );
                              }}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                      {errors.scholarshipQualifications && (
                        <p className="error-message">{errors.scholarshipQualifications.message}</p>
                      )}
                    </div>
                  )}

                  {/* Transportation reimbursement — only if enabled and scholarship path */}
                  {transportationReimbEnabled && scholarshipQualifies === true && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                      <p className="text-sm font-medium text-blue-900">Transportation Reimbursement</p>
                      <p className="text-xs text-blue-700">The Seattle Aquarium may offer transportation reimbursement assistance for qualifying groups.</p>
                      <div className="flex gap-4 mt-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="transportationRequested"
                            value="yes"
                            checked={transportationRequested === true}
                            onChange={() => setTransportationRequested(true)}
                            className="text-aqua-700"
                          />
                          Yes, we would benefit from reimbursement assistance
                        </label>
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="transportationRequested"
                            value="no"
                            checked={transportationRequested === false}
                            onChange={() => setTransportationRequested(false)}
                            className="text-aqua-700"
                          />
                          No, we don't need reimbursement
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between mt-6">
                  <button onClick={() => setStep(4)} className="btn-secondary">Back</button>
                  <button
                    onClick={async () => {
                      const fieldsToValidate: Parameters<typeof trigger>[0] = [
                        ...(scholarshipQualifies === true ? (["scholarshipQualifications"] as any) : []),
                      ];
                      const valid = fieldsToValidate.length > 0 ? await trigger(fieldsToValidate) : true;
                      if (valid) setStep(6);  // → Payment
                    }}
                    className="btn-primary"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 6: Payment Method */}
            {step === 6 && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Payment Method</h2>
                <p className="text-gray-600 text-sm mb-6">How will your group be paying for the visit?</p>

                <div className="space-y-2">
                  {paymentMethodOptions.map((opt) => {
                    const isSelected = paymentMethod === opt.value;
                    return (
                      <div key={opt.value}>
                        <label
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            isSelected ? "border-aqua-700 bg-aqua-50" : "border-gray-200 hover:border-aqua-300"
                          }`}
                        >
                          <input
                            type="radio"
                            value={opt.value}
                            className="mt-0.5 text-aqua-700"
                            {...form.register("paymentMethod")}
                          />
                          <div>
                            <span className="font-medium text-sm">{opt.label}</span>
                            {opt.description && <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>}
                          </div>
                        </label>
                        {isSelected && opt.subtext && (
                          <div className="ml-3 mt-1 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 prose prose-xs max-w-none">
                            <ReactMarkdown>{opt.subtext}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {errors.paymentMethod && <p className="error-message mt-1">{errors.paymentMethod.message}</p>}

                {s("booking_payment_subtext", "") && (
                  <div className="mt-4 text-xs text-gray-500 prose prose-xs max-w-none [&_strong]:text-gray-700 [&_a]:text-aqua-700">
                    <ReactMarkdown>{s("booking_payment_subtext", "")}</ReactMarkdown>
                  </div>
                )}

                {s("booking_contact_footer", "") && (
                  <div className="mt-4 text-xs text-gray-400 text-center prose prose-xs max-w-none [&_a]:text-aqua-600">
                    <ReactMarkdown>{s("booking_contact_footer", "")}</ReactMarkdown>
                  </div>
                )}

                <div className="flex justify-between mt-6">
                  <button onClick={() => setStep(5)} className="btn-secondary">Back</button>
                  <button
                    onClick={async () => {
                      const valid = await trigger(["paymentMethod"]);
                      if (valid) setStep(7);  // → Classes
                    }}
                    className="btn-primary"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 7: Class Selection */}
            {step === 7 && (() => {
              const selectedClassId = watch("classOfferingId");
              const selectedTimeSlot = watch("classTimeSlot" as any) as string | undefined;

              return (
                <div>
                  <h2 className="text-xl font-semibold mb-2">Add an On-Site Program (Optional)</h2>
                  <p className="text-gray-600 text-sm mb-6">{classStepDescription}</p>
                  <div className="space-y-3 mb-6">
                    <button
                      onClick={() => { setValue("classOfferingId", undefined); (setValue as any)("classTimeSlot", undefined); setStep(8); }}
                      className={`w-full p-4 text-left rounded-lg border-2 transition-colors ${
                        !selectedClassId ? "border-aqua-700 bg-aqua-50" : "border-gray-200 hover:border-aqua-400"
                      }`}
                    >
                      <span className="font-medium">No program — self-guided visit only</span>
                    </button>

                    {classesData?.map((cls) => {
                      const isSelected = selectedClassId === cls.id;
                      const availEntry = classAvailability?.find((a) => a.classOfferingId === cls.id);
                      const slots = availEntry?.availableSlots ?? [];
                      const slotsLoaded = !!classAvailability;

                      return (
                        <div key={cls.id} className={`rounded-lg border-2 transition-colors ${isSelected ? "border-aqua-700 bg-aqua-50" : "border-gray-200"}`}>
                          <button
                            onClick={() => { setValue("classOfferingId", cls.id); (setValue as any)("classTimeSlot", undefined); }}
                            className="w-full p-4 text-left"
                          >
                            <div className="font-medium">{cls.name}</div>
                            <div className="text-sm text-gray-600 mt-1">{cls.description}</div>
                            <div className="text-xs text-gray-500 mt-2">
                              Grades {cls.gradeMin}–{cls.gradeMax} · Up to {cls.capacity} students · {cls.durationMinutes} min
                            </div>
                          </button>

                          {isSelected && (
                            <div className="px-4 pb-4 border-t border-aqua-100 pt-3">
                              <p className="text-sm font-medium text-gray-800 mb-2">
                                Choose a program time:
                              </p>
                              {!slotsLoaded ? (
                                <p className="text-xs text-gray-400">Loading available times…</p>
                              ) : slots.length === 0 ? (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                  No program times available for your arrival time. Choose a different arrival time or select self-guided only.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {slots.map((slot) => (
                                    <button
                                      key={slot}
                                      type="button"
                                      onClick={() => { (setValue as any)("classTimeSlot", slot); setStep(8); }}
                                      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                                        selectedTimeSlot === slot
                                          ? "border-aqua-700 bg-aqua-700 text-white"
                                          : "border-gray-200 hover:border-aqua-400 text-gray-800"
                                      }`}
                                    >
                                      {formatTimeSlot(slot)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between">
                    <button onClick={() => setStep(6)} className="btn-secondary">Back</button>
                  </div>
                </div>
              );
            })()}

            {/* Step 8: Review & Submit */}
            {step === 8 && (
              <div>
                <h2 className="text-xl font-semibold mb-6">Review & Confirm</h2>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Group type</span>
                    <span className="font-medium">
                      {groupTypeOptions.find((o) => o.value === watch("groupType"))?.label ?? watch("groupType")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Organization</span>
                    <span className="font-medium">{watch("organizationName")}</span>
                  </div>
                  {watch("schoolDistrict") && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">School District</span>
                      <span className="font-medium">{watch("schoolDistrict")}</span>
                    </div>
                  )}
                  {watch("dayOfContactName") && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Day-of-Visit Contact</span>
                      <span className="font-medium">{watch("dayOfContactName")}</span>
                    </div>
                  )}
                  {watch("dayOfContactPhone") && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Day-of-Visit Phone</span>
                      <span className="font-medium">{watch("dayOfContactPhone")}</span>
                    </div>
                  )}
                  {watch("dayOfContactEmail" as any) && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Day-of-Visit Email</span>
                      <span className="font-medium">{watch("dayOfContactEmail" as any)}</span>
                    </div>
                  )}
                  {watch("addressStreet1") && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 shrink-0">Address</span>
                      <span className="font-medium text-right">
                        {watch("addressStreet1")}{watch("addressStreet2") ? `, ${watch("addressStreet2")}` : ""}<br />
                        {[watch("addressCity"), watch("addressState")].filter(Boolean).join(", ")}{watch("addressZip") ? ` ${watch("addressZip")}` : ""}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Visit date</span>
                    <span className="font-medium">{watch("visitDate")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Arrival time</span>
                    <span className="font-medium">{formatTimeSlot(watch("arrivalTimeSlot") || "")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Students</span>
                    <span className="font-medium">{studentCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Adult chaperones</span>
                    <span className="font-medium">{adultCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Billing</span>
                    <span className="font-medium">
                      {scholarshipQualifies === true
                        ? "Scholarship (applying)"
                        : (paymentMethodOptions.find((o) => o.value === watch("paymentMethod"))?.label ?? watch("paymentMethod"))}
                    </span>
                  </div>
                  {watch("classOfferingId") && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Class</span>
                      <span className="font-medium">
                        {classesData?.find((c) => c.id === watch("classOfferingId"))?.name ?? "Selected"}
                      </span>
                    </div>
                  )}
                  {/* Accessibility summary */}
                  {(accessibilityAccommodations.length > 0 || accessibilityMultilingual.length > 0) && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 shrink-0">Accessibility</span>
                      <span className="font-medium text-right text-amber-700">
                        {[
                          accessibilityAccommodations.length > 0 ? `${accessibilityAccommodations.length} accommodation${accessibilityAccommodations.length !== 1 ? "s" : ""}` : null,
                          accessibilityMultilingual.length > 0 ? `${accessibilityMultilingual.length} multilingual request${accessibilityMultilingual.length !== 1 ? "s" : ""}` : null,
                        ].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                  {/* Scholarship summary */}
                  {scholarshipQualifies === true && scholarshipQualificationsSelected.length > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 shrink-0">Scholarship criteria</span>
                      <span className="font-medium text-right text-sm">{scholarshipQualificationsSelected.length} selected</span>
                    </div>
                  )}
                  {transportationRequested && scholarshipQualifies === true && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Transportation reimbursement</span>
                      <span className="font-medium text-blue-700">Requested</span>
                    </div>
                  )}
                  {watch("groupNotes" as any) && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 shrink-0">Group notes</span>
                      <span className="font-medium text-right text-sm">{watch("groupNotes" as any)}</span>
                    </div>
                  )}
                </div>

                {/* Code of Conduct */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-gray-300 text-aqua-700"
                      {...form.register("cocAcknowledged")}
                    />
                    <span className="text-sm text-blue-900">
                      {cocPrefix}
                      <a href={cocUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        {cocLinkLabel}
                      </a>
                      {cocSuffix}
                    </span>
                  </label>
                  {errors.cocAcknowledged && (
                    <p className="error-message mt-2">{errors.cocAcknowledged.message}</p>
                  )}
                </div>

                {/* hCaptcha widget */}
                {hcaptchaSiteKey && (
                  <div className="mb-6 flex justify-center">
                    <HCaptcha
                      ref={hcaptchaRef}
                      sitekey={hcaptchaSiteKey}
                      onVerify={(token) => setHcaptchaToken(token)}
                      onExpire={() => setHcaptchaToken(null)}
                    />
                  </div>
                )}

                {(clientValidationError || serverError) && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-900">{clientValidationError ?? serverError}</p>
                      {clientValidationError && (
                        <p className="text-sm text-red-700 mt-1">Use the Back button to review earlier steps.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <button onClick={() => setStep(7)} className="btn-secondary">Back</button>
                  <button
                    onClick={onSubmit}
                    className="btn-primary"
                    disabled={createBookingMutation.isPending}
                  >
                    {createBookingMutation.isPending ? "Submitting…" : "Submit Request"}
                  </button>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
