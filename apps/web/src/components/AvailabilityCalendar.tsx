import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarDay {
  date: string;
  capacityLimit: number;
  remainingCapacity: number;
  isBlackout: boolean;
  isAvailable: boolean;
  isLimitedAvailability: boolean;
}

interface Props {
  groupSize: number;
  selectedDate: string | null;
  onDateSelect: (date: string) => void;
}

export function AvailabilityCalendar({ groupSize, selectedDate, onDateSelect }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDateStr = format(monthStart, "yyyy-MM-dd");
  const endDateStr = format(monthEnd, "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["availability", startDateStr, endDateStr, groupSize],
    queryFn: () =>
      api.get<{ calendar: CalendarDay[] }>("/public/availability", {
        params: { startDate: startDateStr, endDate: endDateStr, groupSize },
      }).then((r) => r.data.calendar),
    staleTime: 30_000,
  });

  const calendarMap = new Map(data?.map((d) => [d.date, d]) ?? []);

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startWeekday = getDay(monthStart); // 0=Sun

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="font-semibold text-lg">{format(currentMonth, "MMMM yyyy")}</h3>
        <button
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for start offset */}
        {Array.from({ length: startWeekday }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const info = calendarMap.get(dateStr);
          const isSelected = selectedDate === dateStr;
          const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

          let cellClass =
            "relative h-12 flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors ";

          if (isSelected) {
            cellClass += "bg-aqua-700 text-white";
          } else if (isPast || !info || !info.isAvailable) {
            cellClass += "text-gray-300 cursor-not-allowed bg-gray-50";
          } else if (info.isLimitedAvailability) {
            cellClass += "bg-amber-50 text-amber-900 hover:bg-amber-100 cursor-pointer border border-amber-300";
          } else {
            cellClass += "bg-white text-gray-900 hover:bg-aqua-50 hover:border-aqua-500 cursor-pointer border border-gray-200";
          }

          return (
            <button
              key={dateStr}
              onClick={() => info?.isAvailable && !isPast && onDateSelect(dateStr)}
              disabled={isPast || !info?.isAvailable}
              className={cellClass}
              aria-label={`${dateStr}${info ? `, ${info.remainingCapacity} spots remaining` : ""}`}
              aria-pressed={isSelected}
            >
              <span>{format(day, "d")}</span>
              {isLoading ? (
                <span className="text-xs text-gray-300">...</span>
              ) : info?.isLimitedAvailability ? (
                <span className="text-xs text-amber-600">Limited</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-white border border-gray-200" />
          Available
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-50 border border-amber-300" />
          Limited
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gray-50" />
          Unavailable
        </span>
      </div>
    </div>
  );
}
