import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { DailyCapacityInfo } from "@tidebook/shared";
import { ChevronLeft, ChevronRight, Ban, Edit2, X, Check } from "lucide-react";

type CapacityRow = { date: string; capacityLimit: number; isBlackout: boolean; note: string | null };

function formatMonth(year: number, month: number) {
  return new Date(year, month, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function AdminCapacity() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ capacityLimit: string; isBlackout: boolean; note: string }>({
    capacityLimit: "",
    isBlackout: false,
    note: "",
  });

  const qc = useQueryClient();

  const dateFrom = toDateStr(year, month, 1);
  const dateTo = toDateStr(year, month, getDaysInMonth(year, month));

  const { data } = useQuery({
    queryKey: ["admin-capacity", dateFrom, dateTo],
    queryFn: () =>
      api
        .get<{ capacities: CapacityRow[] }>("/admin/capacity", { params: { dateFrom, dateTo } })
        .then((r) => r.data.capacities),
  });

  const { data: seasonData } = useQuery({
    queryKey: ["admin-seasons"],
    queryFn: () =>
      api.get<{ seasons: { defaultDailyCapacity: number; isPublished: boolean }[] }>("/admin/seasons").then((r) => r.data.seasons),
  });

  const defaultCapacity =
    seasonData?.find((s) => s.isPublished)?.defaultDailyCapacity ??
    seasonData?.[0]?.defaultDailyCapacity ??
    300;

  const capMap = new Map(data?.map((c) => [c.date, c]) ?? []);

  const updateMutation = useMutation({
    mutationFn: ({ date, body }: { date: string; body: { capacityLimit: number; isBlackout: boolean; note: string } }) =>
      api.put(`/admin/capacity/${date}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-capacity"] });
      setEditing(null);
    },
  });

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const openEdit = (dateStr: string) => {
    const existing = capMap.get(dateStr);
    setEditForm({
      capacityLimit: existing ? String(existing.capacityLimit) : String(defaultCapacity),
      isBlackout: existing?.isBlackout ?? false,
      note: existing?.note ?? "",
    });
    setEditing(dateStr);
  };

  const saveEdit = () => {
    if (!editing) return;
    updateMutation.mutate({
      date: editing,
      body: {
        capacityLimit: parseInt(editForm.capacityLimit) || defaultCapacity,
        isBlackout: editForm.isBlackout,
        note: editForm.note,
      },
    });
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayStr = today.toISOString().slice(0, 10);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Visit Calendar</h1>
      <p className="text-gray-500 text-sm mb-6">
        Mark specific dates as closed or set a custom visitor limit for any day. All other dates use the season's default capacity.
      </p>

      {/* Month navigation */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={prevMonth} className="btn-secondary p-2">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold w-48 text-center">{formatMonth(year, month)}</h2>
        <button onClick={nextMonth} className="btn-secondary p-2">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-sm text-gray-500 ml-2">
          Default capacity: <strong>{defaultCapacity}</strong> visitors/day
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-gray-600 mb-4">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-white border border-gray-200 inline-block" /> Default</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> Custom limit</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block" /> Closed / blocked</span>
      </div>

      {/* Calendar grid */}
      <div className="card p-4">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const dateStr = toDateStr(year, month, day);
            const cap = capMap.get(dateStr);
            const isToday = dateStr === todayStr;
            const isBlackout = cap?.isBlackout ?? false;
            const hasOverride = !!cap && !cap.isBlackout;
            const isPast = dateStr < todayStr;

            return (
              <button
                key={dateStr}
                onClick={() => openEdit(dateStr)}
                className={`
                  relative min-h-[60px] rounded-lg p-2 text-left text-xs border transition-colors
                  ${isBlackout ? "bg-red-50 border-red-200 hover:bg-red-100" : hasOverride ? "bg-amber-50 border-amber-200 hover:bg-amber-100" : "bg-white border-gray-200 hover:bg-gray-50"}
                  ${isPast ? "opacity-50" : ""}
                `}
              >
                <div className={`font-semibold mb-1 ${isToday ? "text-aqua-700" : "text-gray-800"}`}>
                  {day}
                  {isToday && <span className="ml-1 text-aqua-600">•</span>}
                </div>
                {isBlackout ? (
                  <span className="text-red-600 flex items-center gap-0.5">
                    <Ban className="h-3 w-3" /> Closed
                  </span>
                ) : cap ? (
                  <span className="text-amber-700">Limit: {cap.capacityLimit}</span>
                ) : (
                  <span className="text-gray-400">Default</span>
                )}
                {cap?.note && (
                  <div className="text-gray-500 truncate mt-0.5">{cap.note}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Edit panel */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {new Date(editing + "T12:00:00").toLocaleDateString("default", {
                  weekday: "long", month: "long", day: "numeric", year: "numeric",
                })}
              </h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-red-600 h-4 w-4"
                  checked={editForm.isBlackout}
                  onChange={(e) => setEditForm((f) => ({ ...f, isBlackout: e.target.checked }))}
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Close this date to new bookings</span>
                  <p className="text-xs text-gray-500">Groups won't be able to select this date. Existing bookings are not affected.</p>
                </div>
              </label>

              {!editForm.isBlackout && (
                <div>
                  <label className="label text-xs">Visitor limit for this day</label>
                  <input
                    type="number"
                    className="input text-sm mt-1 w-full"
                    value={editForm.capacityLimit}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setEditForm((f) => ({ ...f, capacityLimit: e.target.value }))}
                    placeholder={String(defaultCapacity)}
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave at {defaultCapacity} to use the season default.</p>
                </div>
              )}

              <div>
                <label className="label text-xs">Staff note (optional)</label>
                <input
                  className="input text-sm mt-1 w-full"
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Staff training day, special event"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={saveEdit}
                disabled={updateMutation.isPending}
                className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-2"
              >
                <Check className="h-4 w-4" />
                {updateMutation.isPending ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(null)} className="btn-secondary text-sm px-4 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
