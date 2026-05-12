import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { AvailabilityCalendar } from "../components/AvailabilityCalendar";
import { AlertCircle, CheckCircle, Fish } from "lucide-react";
import { AxiosError } from "axios";
import { Booking, ClassOffering } from "@tidebook/shared";

export default function ReschedulePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState(false);

  const { data: bookingData, isLoading, error: fetchError } = useQuery({
    queryKey: ["reschedule-booking", token],
    queryFn: () =>
      api.get<{ booking: Booking }>("/public/bookings/reschedule", { params: { token } }).then((r) => r.data),
    enabled: !!token,
    retry: false,
  });

  const { data: timeSlotsData } = useQuery({
    queryKey: ["time-slots-reschedule", selectedDate],
    queryFn: () =>
      api.get<{ timeSlots: string[] }>("/public/availability", {
        params: { startDate: selectedDate, endDate: selectedDate, groupSize: 1 },
      }).then((r) => r.data.timeSlots),
    enabled: !!selectedDate,
  });

  const { data: classesData } = useQuery({
    queryKey: ["public-classes"],
    queryFn: () => api.get<{ classes: ClassOffering[] }>("/public/classes").then((r) => r.data.classes),
    staleTime: 5 * 60_000,
  });

  const rescheduleMutation = useMutation({
    mutationFn: () =>
      api.post("/public/bookings/reschedule", {
        token,
        visitDate: selectedDate,
        arrivalTimeSlot: selectedSlot,
        classOfferingId: selectedClassId,
      }),
    onSuccess: () => setSuccess(true),
  });

  const booking = bookingData?.booking;
  const groupSize = booking ? booking.studentCount + booking.adultCount : 1;
  const hasClass = (booking?.classBookings?.length ?? 0) > 0;
  const serverError = (rescheduleMutation.error as AxiosError<any>)?.response?.data?.error;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-gray-600">Invalid reschedule link. Please use the link from your confirmation email.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-aqua-900 to-aqua-700 flex items-center justify-center p-4">
        <div className="card text-center max-w-md">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Visit Rescheduled!</h2>
          <p className="text-gray-600">
            Your visit has been rescheduled to <strong>{selectedDate}</strong> at <strong>{selectedSlot}</strong>. A new confirmation email is on its way.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aqua-900 to-aqua-700 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <Fish className="h-8 w-8 text-white mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-white">Reschedule Your Visit</h1>
        </div>

        <div className="card">
          {isLoading && <p className="text-gray-600 text-center py-8">Loading booking details…</p>}

          {fetchError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <p className="text-red-900">
                This reschedule link is invalid or has expired. Please contact us to reschedule.
              </p>
            </div>
          )}

          {booking && (
            <>
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm">
                <h3 className="font-medium mb-2">Current Booking</h3>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Organization</span>
                    <span>{booking.organizationName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Current date</span>
                    <span className="font-medium">{booking.visitDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Arrival time</span>
                    <span>{booking.arrivalTimeSlot}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Group size</span>
                    <span>{booking.studentCount} students + {booking.adultCount} chaperones</span>
                  </div>
                </div>
              </div>

              <h3 className="font-medium mb-4">Select a New Date</h3>
              <AvailabilityCalendar
                groupSize={groupSize}
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
              />

              {selectedDate && (
                <div className="mt-4">
                  <label className="label">New Arrival Time</label>
                  <select
                    className="input"
                    value={selectedSlot ?? ""}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                  >
                    <option value="">Select time…</option>
                    {timeSlotsData?.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              {hasClass && selectedDate && (
                <div className="mt-4">
                  <label className="label">Class Selection for New Date</label>
                  <p className="text-xs text-gray-500 mb-2">Class availability may differ on the new date.</p>
                  <select
                    className="input"
                    value={selectedClassId ?? ""}
                    onChange={(e) => setSelectedClassId(e.target.value || undefined)}
                  >
                    <option value="">No class — self-guided visit</option>
                    {classesData?.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {serverError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <p className="text-red-900">{serverError.message}</p>
                </div>
              )}

              <button
                onClick={() => rescheduleMutation.mutate()}
                disabled={!selectedDate || !selectedSlot || rescheduleMutation.isPending}
                className="btn-primary w-full mt-6"
              >
                {rescheduleMutation.isPending ? "Saving…" : "Confirm New Date"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
