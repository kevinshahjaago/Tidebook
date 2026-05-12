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
import { AlertCircle, Fish, Clock } from "lucide-react";
import { AxiosError } from "axios";
import { format, parseISO } from "date-fns";

type Step = 1 | 2 | 3 | 4 | 5;
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
  "Pre-K", "Kindergarten", "1st Grade", "2nd Grade", "3rd Grade",
  "4th Grade", "5th Grade", "6th Grade", "7th Grade", "8th Grade",
  "9th Grade", "10th Grade", "11th Grade", "12th Grade",
  "College/University",
];

// College/University groups have no chaperone ratio requirement
const NO_RATIO_GRADES = new Set(["College/University"]);

type PaymentMethodOption = { value: string; label: string; description: string; emailInstructions: string; isVisible: boolean };

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

  const form = useForm<CreateBookingInput>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: {
      cocAcknowledged: undefined as any,
      studentCount: undefined as any,
      adultCount: undefined as any,
      gradeLevels: [],
      accessibilityNeeds: "None",
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

  // Keep accessibilityNeeds form value in sync with checkbox state
  React.useEffect(() => {
    const parts = [...accessibilitySelected];
    if (accessibilityOther.trim()) parts.push(`Other: ${accessibilityOther.trim()}`);
    setValue("accessibilityNeeds", parts.length > 0 ? parts.join(", ") : "None");
  }, [accessibilitySelected, accessibilityOther]);

  // Sync per-grade counts → form fields (school/homeschool only)
  React.useEffect(() => {
    if (!isSchoolGroup) return;
    const selectedGrades = Object.keys(gradeCountMap);
    const total = Object.values(gradeCountMap).reduce((s, n) => s + n, 0);
    setValue("gradeLevels", selectedGrades);
    setValue("studentCount", total > 0 ? total : (undefined as any));
    (setValue as any)("gradeStudentCounts", JSON.stringify(gradeCountMap));
  }, [gradeCountMap, isSchoolGroup]);

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => api.get<{ settings: Record<string, string> }>("/public/settings").then((r) => r.data.settings),
    staleTime: 60 * 60_000,
  });

  const s = (key: string, fallback: string) => publicSettings?.[key] ?? fallback;

  const LOWER_GRADES = new Set([
    "Pre-K", "Kindergarten", "1st Grade", "2nd Grade", "3rd Grade",
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
        { value: "PAID",       label: "Pay by credit card or check",   description: "Payment is due on the day of your visit.",                  emailInstructions: "", isVisible: true },
        { value: "SCHOLARSHIP", label: "Apply for a scholarship",        description: "For Title I schools and qualifying organizations.",         emailInstructions: "", isVisible: true },
        { value: "INVOICE",    label: "Invoice / Purchase Order",        description: "For organizations that pay by purchase order or invoice.", emailInstructions: "", isVisible: true },
      ];
    }
  })();

  const accessibilityOptions: string[] = (() => {
    try { return JSON.parse(s("accessibility_options", "[]")); } catch { return []; }
  })();

  const specialRequestsLabel = s("booking_special_requests_label", "Special Requests");

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
    enabled: !!visitDate && !!arrivalTimeSlot && step === 4,
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
      createBookingMutation.mutate(data);
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
      <div className="min-h-screen py-8 px-4" style={{ background: "linear-gradient(160deg, #002A36 0%, #005568 55%, #0083A0 100%)" }}>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Fish className="h-8 w-8 text-white" />
              <h1 className="text-2xl font-bold text-white">Seattle Aquarium</h1>
            </div>
            <p className="text-aqua-100">{formSubtitle}</p>
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
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  s === step ? "w-8 bg-white" : s < step ? "w-4 bg-aqua-300" : "w-4 bg-aqua-600"
                }`}
              />
            ))}
          </div>

          {/* Slot hold countdown banner — shown from step 3 onwards */}
          {holdExpiresAt && !holdExpired && step >= 3 && (
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
                        setValue("groupType", opt.value as GroupType);
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
                              <span>Pre-K – 8th grade ({lowerGradeStudents} students)</span>
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

                <div className="flex justify-between mt-6">
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
                    <label className="label">School / Organization Address</label>
                    <input className="input" placeholder="Street address" {...form.register("addressStreet1")} />
                    <input className="input" placeholder="Apt, Suite, Bldg (optional)" {...form.register("addressStreet2")} />
                    <div className="grid grid-cols-2 sm:grid-cols-[1fr_80px_100px] gap-2">
                      <input className="input col-span-2 sm:col-span-1" placeholder="City" {...form.register("addressCity")} />
                      <input className="input uppercase" maxLength={2} placeholder="State" {...form.register("addressState")} />
                      <input className="input" placeholder="ZIP" {...form.register("addressZip")} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Lead Teacher / Contact Name (required)</label>
                      <input className={`input ${errors.contactName ? "input-error" : ""}`} {...form.register("contactName")} />
                      {errors.contactName && <p className="error-message">{errors.contactName.message}</p>}
                    </div>
                    <div>
                      <label className="label">Phone (required)</label>
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
                  <div>
                    <label className="label">Billing Arrangement (required)</label>
                    <div className="space-y-2 mt-1">
                      {paymentMethodOptions.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            paymentMethod === opt.value
                              ? "border-aqua-700 bg-aqua-50"
                              : "border-gray-200 hover:border-aqua-300"
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
                      ))}
                    </div>
                    {errors.paymentMethod && <p className="error-message mt-1">{errors.paymentMethod.message}</p>}
                  </div>

                  {/* Scholarship sub-flow */}
                  {paymentMethod === PaymentMethod.SCHOLARSHIP && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <h3 className="font-medium text-amber-900">Scholarship Information</h3>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="rounded" {...form.register("scholarship.titleOneStatus")} />
                        My school qualifies as Title I
                      </label>
                      <div>
                        <label className="label">Total School Enrollment (required)</label>
                        <input
                          type="number"
                          className={`input ${errors.scholarship?.enrollmentCount ? "input-error" : ""}`}
                          onWheel={(e) => e.currentTarget.blur()}
                          {...form.register("scholarship.enrollmentCount", { valueAsNumber: true })}
                        />
                        {errors.scholarship?.enrollmentCount && (
                          <p className="error-message">{errors.scholarship.enrollmentCount.message}</p>
                        )}
                      </div>
                      <div>
                        <label className="label">Additional qualifying information (required)</label>
                        <textarea
                          rows={3}
                          className={`input ${errors.scholarship?.qualifyingInfo ? "input-error" : ""}`}
                          placeholder="Describe your school's qualifying circumstances"
                          {...form.register("scholarship.qualifyingInfo")}
                        />
                        {errors.scholarship?.qualifyingInfo && (
                          <p className="error-message">{errors.scholarship.qualifyingInfo.message}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label">Accessibility & Accommodation Needs</label>
                    <p className="text-xs text-gray-500 mb-2">Select all that apply for your group. We'll make sure everything is ready for your visit.</p>
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
                    {errors.accessibilityNeeds && <p className="error-message mt-1">{errors.accessibilityNeeds.message}</p>}
                  </div>
                  {specialRequestsLabel && (
                    <div>
                      <label className="label">{specialRequestsLabel}</label>
                      <textarea
                        rows={2}
                        className={`input ${errors.specialRequests ? "input-error" : ""}`}
                        placeholder="Parking, lunch space, etc. — or leave blank if none"
                        {...form.register("specialRequests")}
                      />
                      {errors.specialRequests && <p className="error-message">{errors.specialRequests.message}</p>}
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
                        "paymentMethod",
                        // gradeLevels only validated here for non-school groups (school/homeschool already did it in step 2)
                        ...(!isSchoolGroup ? (["gradeLevels"] as any) : []),
                        ...(paymentMethod === PaymentMethod.SCHOLARSHIP
                          ? (["scholarship.enrollmentCount", "scholarship.qualifyingInfo"] as any)
                          : []),
                      ];
                      const valid = await trigger(fieldsToValidate);
                      if (valid) setStep(4);
                    }}
                    className="btn-primary"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Class Selection */}
            {step === 4 && (() => {
              const selectedClassId = watch("classOfferingId");
              const selectedTimeSlot = watch("classTimeSlot" as any) as string | undefined;

              return (
                <div>
                  <h2 className="text-xl font-semibold mb-2">Add an On-Site Program (Optional)</h2>
                  <p className="text-gray-600 text-sm mb-6">{classStepDescription}</p>
                  <div className="space-y-3 mb-6">
                    <button
                      onClick={() => { setValue("classOfferingId", undefined); (setValue as any)("classTimeSlot", undefined); setStep(5); }}
                      className={`w-full p-4 text-left rounded-lg border-2 transition-colors ${
                        !selectedClassId ? "border-aqua-700 bg-aqua-50" : "border-gray-200 hover:border-aqua-400"
                      }`}
                    >
                      <span className="font-medium">No program — self-guided visit only</span>
                    </button>

                    {classesData?.map((cls) => {
                      const isSelected = selectedClassId === cls.id;
                      // Use live availability from API (respects arrival buffer, capacity, break rules)
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

                          {/* Time slot picker — always shown when class is selected */}
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
                                      onClick={() => { (setValue as any)("classTimeSlot", slot); setStep(5); }}
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
                    <button onClick={() => setStep(3)} className="btn-secondary">Back</button>
                  </div>
                </div>
              );
            })()}

            {/* Step 5: Review & Submit */}
            {step === 5 && (
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
                      {paymentMethodOptions.find((o) => o.value === watch("paymentMethod"))?.label ?? watch("paymentMethod")}
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
                  <button onClick={() => setStep(4)} className="btn-secondary">Back</button>
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
