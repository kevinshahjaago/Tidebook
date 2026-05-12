import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import {
  ChevronLeft,
  ChevronRight,
  Users,
  GraduationCap,
  Clock,
  Accessibility,
  AlertCircle,
  CalendarDays,
  BookOpen,
  ClipboardCheck,
  Info,
  Layers,
  UserCheck,
  ChevronDown,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatMonth(year: number, month: number) {
  return new Date(year, month, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

function formatTimeRange(slot: string, minutes: number) {
  const [h, m] = slot.split(":").map(Number);
  const endMins = h * 60 + m + minutes;
  const endH = Math.floor(endMins / 60);
  const endM = endMins % 60;
  const endSlot = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  return `${formatTime(slot)} – ${formatTime(endSlot)}`;
}

const GROUP_TYPE_LABELS: Record<string, string> = {
  SCHOOL: "School",
  HOMESCHOOL: "Homeschool",
  CORPORATE: "Corporate",
  ADHOC: "Community",
  CONNECTIONS: "Connections",
};

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-800 border-green-200",
  PENDING:   "bg-amber-100 text-amber-800 border-amber-200",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface DaySummary {
  date: string;
  groupCount: number;
  totalStudents: number;
  totalAdults: number;
  classSessions: number;
  hasAccessibilityNeeds: boolean;
}

interface FieldTrip {
  id: string;
  status: string;
  groupType: string;
  organizationName: string;
  contactName: string;
  arrivalTimeSlot: string;
  studentCount: number;
  adultCount: number;
  gradeLevels: string[];
  accessibilityNeeds: string | null;
  specialRequests: string | null;
  internalNotes: string | null;
  classSession: {
    offeringName: string;
    sessionSlot: string;
    durationMinutes: number;
    resourceRequirements: string | null;
  } | null;
}

interface ClassSession {
  sessionSlot: string;
  offeringName: string;
  durationMinutes: number;
  resourceRequirements: string | null;
  instructorId: string | null;
  instructorEmail: string | null;
  classBookingIds: string[];
  groups: Array<{
    bookingId: string;
    classBookingId: string | null;
    organizationName: string;
    studentCount: number;
    gradeLevels: string[];
  }>;
}

interface DayDetail {
  date: string;
  summary: {
    groupCount: number;
    totalStudents: number;
    totalAdults: number;
    classSessionCount: number;
    hasAccessibilityNeeds: boolean;
    pendingCount: number;
  };
  fieldTrips: FieldTrip[];
  classSessions: ClassSession[];
}

// ── Month Calendar ────────────────────────────────────────────────────────────

function CalendarGrid({
  year,
  month,
  dayMap,
  selected,
  today,
  onSelect,
}: {
  year: number;
  month: number;
  dayMap: Map<string, DaySummary>;
  selected: string | null;
  today: string;
  onSelect: (d: string) => void;
}) {
  const days = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  // Pad to full 6-row grid
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-gray-100 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-b-lg overflow-hidden">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="bg-gray-50 min-h-[76px]" />;

          const dateStr = toDateStr(year, month, day);
          const summary = dayMap.get(dateStr);
          const isToday = dateStr === today;
          const isSelected = dateStr === selected;
          const hasData = !!summary;

          return (
            <button
              key={dateStr}
              onClick={() => onSelect(dateStr)}
              className={`min-h-[76px] p-1.5 text-left transition-colors group relative ${
                isSelected
                  ? "bg-aqua-700 text-white"
                  : hasData
                  ? "bg-white hover:bg-aqua-50 cursor-pointer"
                  : "bg-white hover:bg-gray-50 cursor-pointer"
              }`}
            >
              {/* Date number */}
              <div
                className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                  isToday && !isSelected
                    ? "bg-aqua-700 text-white"
                    : isSelected
                    ? "bg-white/20 text-white"
                    : "text-gray-700"
                }`}
              >
                {day}
              </div>

              {/* Day summary chips */}
              {summary && (
                <div className="space-y-0.5">
                  <div className={`flex items-center gap-1 text-[10px] font-medium ${isSelected ? "text-white/90" : "text-aqua-700"}`}>
                    <Users className="h-2.5 w-2.5 flex-shrink-0" />
                    <span>{summary.groupCount} group{summary.groupCount !== 1 ? "s" : ""}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] ${isSelected ? "text-white/80" : "text-gray-500"}`}>
                    <span>{summary.totalStudents} students</span>
                  </div>
                  {summary.classSessions > 0 && (
                    <div className={`flex items-center gap-1 text-[10px] ${isSelected ? "text-aqua-200" : "text-teal-600"}`}>
                      <GraduationCap className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>{summary.classSessions} class{summary.classSessions !== 1 ? "es" : ""}</span>
                    </div>
                  )}
                  {summary.hasAccessibilityNeeds && (
                    <div className={`text-[10px] ${isSelected ? "text-amber-200" : "text-amber-500"}`}>⚑ access needs</div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Field Trip Card ───────────────────────────────────────────────────────────

function FieldTripCard({ trip }: { trip: FieldTrip }) {
  const [expanded, setExpanded] = useState(false);
  const hasAccessibility = trip.accessibilityNeeds && trip.accessibilityNeeds !== "None";
  const hasSpecialReqs = !!trip.specialRequests?.trim();
  const hasNotes = !!trip.internalNotes?.trim();

  return (
    <div className={`rounded-xl border ${trip.status === "PENDING" ? "border-amber-200 bg-amber-50/40" : "border-gray-200 bg-white"} overflow-hidden`}>
      {/* Main row */}
      <div className="px-4 py-3 flex items-start gap-4">
        {/* Arrival time */}
        <div className="flex-shrink-0 text-center min-w-[52px]">
          <div className="text-sm font-bold text-aqua-700">{formatTime(trip.arrivalTimeSlot)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">arrival</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-gray-900 text-sm leading-tight">{trip.organizationName}</div>
              <div className="text-xs text-gray-500 mt-0.5">{GROUP_TYPE_LABELS[trip.groupType] ?? trip.groupType} · {trip.contactName}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {trip.status === "PENDING" && (
                <span className="badge border bg-amber-100 text-amber-700 border-amber-200">Pending review</span>
              )}
              {hasAccessibility && (
                <span title={trip.accessibilityNeeds ?? ""} className="badge border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                  <Accessibility className="h-3 w-3" /> Accessibility
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mt-2 text-xs text-gray-600 flex-wrap">
            <span className="flex items-center gap-1"><Users className="h-3 w-3 text-gray-400" />{trip.studentCount} students + {trip.adultCount} adults</span>
            {trip.gradeLevels.length > 0 && (
              <span className="text-gray-500">{trip.gradeLevels.slice(0, 3).join(", ")}{trip.gradeLevels.length > 3 ? ` +${trip.gradeLevels.length - 3}` : ""}</span>
            )}
          </div>

          {trip.classSession && (
            <div className="mt-2 flex items-center gap-2 bg-aqua-50 rounded-lg px-3 py-1.5 text-xs text-aqua-800">
              <GraduationCap className="h-3.5 w-3.5 text-aqua-600 flex-shrink-0" />
              <span className="font-medium">{trip.classSession.offeringName}</span>
              <span className="text-aqua-500">·</span>
              <span>{formatTimeRange(trip.classSession.sessionSlot, trip.classSession.durationMinutes)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to={`/admin/bookings/${trip.id}`}
            className="text-xs text-aqua-600 hover:text-aqua-800 hover:underline whitespace-nowrap"
          >
            View →
          </Link>
          {(hasAccessibility || hasSpecialReqs || hasNotes) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title={expanded ? "Collapse" : "Show notes & accessibility details"}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded notes */}
      {expanded && (hasAccessibility || hasSpecialReqs || hasNotes) && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2 space-y-2">
          {hasAccessibility && (
            <div>
              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-1">Accessibility needs</p>
              <p className="text-xs text-gray-700 leading-relaxed">{trip.accessibilityNeeds}</p>
            </div>
          )}
          {hasSpecialReqs && (
            <div>
              <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Special requests</p>
              <p className="text-xs text-gray-700 leading-relaxed">{trip.specialRequests}</p>
            </div>
          )}
          {hasNotes && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Internal notes</p>
              <p className="text-xs text-gray-700 leading-relaxed">{trip.internalNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Class Session Block ───────────────────────────────────────────────────────

function ClassSessionBlock({ session, selectedDate }: { session: ClassSession; selectedDate: string }) {
  const qc = useQueryClient();
  const totalStudents = session.groups.reduce((s, g) => s + g.studentCount, 0);
  const [showInstructorPicker, setShowInstructorPicker] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: () => api.get<{ users: Array<{ id: string; email: string; role: string }> }>("/admin/users").then((r) => r.data.users),
    staleTime: 5 * 60_000,
    enabled: showInstructorPicker,
  });

  const assignMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post("/admin/class-bookings/assign-instructor", {
        classBookingIds: session.classBookingIds,
        instructorId: userId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-day", selectedDate] });
      setShowInstructorPicker(false);
    },
  });

  const instructorLabel = session.instructorEmail ?? "Assign instructor";

  return (
    <div className="rounded-xl border border-aqua-200 bg-aqua-50 overflow-hidden">
      <div className="flex items-start gap-4 px-4 py-3">
        {/* Time */}
        <div className="flex-shrink-0 min-w-[80px]">
          <div className="text-sm font-bold text-aqua-800">{formatTime(session.sessionSlot)}</div>
          <div className="text-[10px] text-aqua-600 mt-0.5">{session.durationMinutes} min</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="font-semibold text-aqua-900 text-sm">{session.offeringName}</div>

            {/* Instructor assignment */}
            {session.classBookingIds.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowInstructorPicker((v) => !v)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    session.instructorId
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-white text-aqua-700 border-aqua-200 hover:bg-aqua-50"
                  }`}
                >
                  <UserCheck className="h-3 w-3" />
                  <span className="truncate max-w-[140px]">{instructorLabel}</span>
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                </button>

                {showInstructorPicker && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[200px] py-1 max-h-48 overflow-y-auto">
                    {!usersData ? (
                      <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
                    ) : (
                      usersData.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => assignMutation.mutate(u.id)}
                          disabled={assignMutation.isPending}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-aqua-50 transition-colors ${
                            u.id === session.instructorId ? "text-aqua-700 font-medium" : "text-gray-700"
                          }`}
                        >
                          {u.email}
                          <span className="ml-1.5 text-gray-400 capitalize">({u.role.toLowerCase().replace(/_/g, " ")})</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-aqua-700 flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />{totalStudents} students total
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />{session.groups.length} group{session.groups.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Groups list */}
          <div className="mt-2 space-y-1">
            {session.groups.map((g) => (
              <div key={g.bookingId} className="flex items-center gap-2 text-xs text-aqua-800 bg-white/60 rounded-lg px-2.5 py-1.5">
                <BookOpen className="h-3 w-3 text-aqua-500 flex-shrink-0" />
                <span className="font-medium">{g.organizationName}</span>
                <span className="text-aqua-500">·</span>
                <span>{g.studentCount} students</span>
                {g.gradeLevels.length > 0 && (
                  <>
                    <span className="text-aqua-400">·</span>
                    <span className="text-aqua-600">{g.gradeLevels.slice(0, 2).join(", ")}{g.gradeLevels.length > 2 ? "…" : ""}</span>
                  </>
                )}
              </div>
            ))}
          </div>

          {session.resourceRequirements && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-2 border border-amber-100">
              <ClipboardCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <span className="font-medium">Resources needed: </span>
                {session.resourceRequirements}
              </div>
            </div>
          )}
        </div>

        {/* Duration badge */}
        <div className="flex-shrink-0 text-center bg-white/70 rounded-lg px-2 py-1.5 border border-aqua-200">
          <div className="text-xs font-semibold text-aqua-700">{formatTimeRange(session.sessionSlot, session.durationMinutes)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminSchedule() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [activeTab, setActiveTab] = useState<"trips" | "classes">("trips");

  const dateFrom = toDateStr(year, month, 1);
  const dateTo = toDateStr(year, month, getDaysInMonth(year, month));

  const { data: rangeData } = useQuery({
    queryKey: ["schedule-range", dateFrom, dateTo],
    queryFn: () =>
      api.get<{ days: DaySummary[] }>("/admin/schedule/range", { params: { dateFrom, dateTo } })
        .then((r) => r.data.days),
    staleTime: 2 * 60_000,
  });

  const { data: dayData, isLoading: dayLoading } = useQuery({
    queryKey: ["schedule-day", selectedDate],
    queryFn: () =>
      api.get<DayDetail>("/admin/schedule/day", { params: { date: selectedDate } })
        .then((r) => r.data),
    staleTime: 60_000,
    enabled: !!selectedDate,
  });

  const dayMap = new Map(rangeData?.map((d) => [d.date, d]) ?? []);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const formattedDate = selectedDate
    ? new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Educator Schedule</h1>
        <p className="text-sm text-gray-500 mt-1">
          Field trip arrivals and on-site program schedule — everything your team needs to prepare for each day.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── Left: Month Calendar ─────────────────────────────────────────── */}
        <div className="w-full lg:w-[360px] flex-shrink-0 card p-0 overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-gray-900 text-sm">{formatMonth(year, month)}</span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="px-3 py-3">
            <CalendarGrid
              year={year}
              month={month}
              dayMap={dayMap}
              selected={selectedDate}
              today={todayStr}
              onSelect={setSelectedDate}
            />
          </div>

          {/* Legend */}
          <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <div className="w-3 h-3 rounded-full bg-aqua-700" />
              Today
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <GraduationCap className="h-3 w-3 text-teal-600" />
              Classes
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="text-amber-500 text-xs">⚑</span>
              Access needs
            </div>
          </div>
        </div>

        {/* ── Right: Day Detail ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Day header */}
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-aqua-600" />
                <h2 className="text-lg font-semibold text-gray-900">{formattedDate}</h2>
                {selectedDate === todayStr && (
                  <span className="badge bg-aqua-700 text-white text-[11px] px-2 py-0.5 rounded-full">Today</span>
                )}
              </div>
            </div>
          </div>

          {dayLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-aqua-700 border-t-transparent" />
            </div>
          )}

          {!dayLoading && dayData && (
            <>
              {/* Summary strip */}
              {dayData.summary.groupCount > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                  <StatCard label="Groups" value={dayData.summary.groupCount} icon={<Users className="h-4 w-4" />} color="teal" />
                  <StatCard label="Students" value={dayData.summary.totalStudents} icon={<BookOpen className="h-4 w-4" />} color="teal" />
                  <StatCard label="Adults" value={dayData.summary.totalAdults} icon={<Users className="h-4 w-4" />} color="gray" />
                  <StatCard label="Programs" value={dayData.summary.classSessionCount} icon={<GraduationCap className="h-4 w-4" />} color="teal" />
                  {dayData.summary.pendingCount > 0 && (
                    <StatCard label="Pending" value={dayData.summary.pendingCount} icon={<Clock className="h-4 w-4" />} color="amber" />
                  )}
                  {dayData.summary.hasAccessibilityNeeds && (
                    <StatCard label="Access needs" value="!" icon={<Accessibility className="h-4 w-4" />} color="blue" />
                  )}
                </div>
              ) : (
                <div className="card text-center py-12 mb-4">
                  <CalendarDays className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No field trips scheduled for this day.</p>
                  <p className="text-gray-400 text-xs mt-1">Select another date on the calendar to view its schedule.</p>
                </div>
              )}

              {dayData.summary.groupCount > 0 && (
                <>
                  {/* Tabs */}
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
                    <button
                      onClick={() => setActiveTab("trips")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "trips"
                          ? "bg-white text-aqua-700 shadow-sm"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Arriving Groups
                      <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${activeTab === "trips" ? "bg-aqua-100 text-aqua-700" : "bg-gray-200 text-gray-500"}`}>
                        {dayData.summary.groupCount}
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveTab("classes")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "classes"
                          ? "bg-white text-aqua-700 shadow-sm"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      <GraduationCap className="h-3.5 w-3.5" />
                      Program Schedule
                      <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${activeTab === "classes" ? "bg-aqua-100 text-aqua-700" : "bg-gray-200 text-gray-500"}`}>
                        {dayData.summary.classSessionCount}
                      </span>
                    </button>
                  </div>

                  {/* Arriving Groups tab */}
                  {activeTab === "trips" && (
                    <div className="space-y-3">
                      {dayData.summary.hasAccessibilityNeeds && (
                        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600" />
                          <span>One or more groups have accessibility requirements — expand their cards for details. Confirm accommodations are prepared before the day.</span>
                        </div>
                      )}

                      {dayData.fieldTrips.map((trip) => (
                        <FieldTripCard key={trip.id} trip={trip} />
                      ))}
                    </div>
                  )}

                  {/* Program Schedule tab */}
                  {activeTab === "classes" && (
                    <div className="space-y-3">
                      {dayData.classSessions.length === 0 ? (
                        <div className="card text-center py-10">
                          <GraduationCap className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 text-sm">No on-site programs scheduled for this day.</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mb-2">
                            Programs run in chronological order. Click any group name to view its full booking.
                          </p>
                          {dayData.classSessions.map((session, i) => (
                            <ClassSessionBlock key={`${session.sessionSlot}-${i}`} session={session} selectedDate={selectedDate} />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat card helper ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: "teal" | "gray" | "amber" | "blue";
}) {
  const colors = {
    teal:  "bg-aqua-50 text-aqua-700 border-aqua-200",
    gray:  "bg-gray-50 text-gray-600 border-gray-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue:  "bg-blue-50 text-blue-700 border-blue-200",
  };
  const iconColors = {
    teal:  "text-aqua-500",
    gray:  "text-gray-400",
    amber: "text-amber-500",
    blue:  "text-blue-500",
  };

  return (
    <div className={`rounded-xl border px-3 py-3 ${colors[color]}`}>
      <div className={`mb-1.5 ${iconColors[color]}`}>{icon}</div>
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="text-[11px] font-medium mt-1 opacity-80">{label}</div>
    </div>
  );
}
