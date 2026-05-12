import React, { useState } from "react";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AvailabilityCalendar } from "../../components/AvailabilityCalendar";
import { Fish, LogIn } from "lucide-react";
import { AxiosError } from "axios";

export default function ConnectionsPortal() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("connections_token"));
  const [partner, setPartner] = useState<{ organizationName: string } | null>(null);

  // Auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Booking form
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [formData, setFormData] = useState({
    contactName: "", contactEmail: "", contactPhone: "",
    studentCount: 0, adultCount: 0, gradeLevels: [] as string[],
    accessibilityNeeds: "", specialRequests: "", cocAcknowledged: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const loginMutation = useMutation({
    mutationFn: () => api.post<any>("/connections/auth/login", { email, password }),
    onSuccess: (res) => {
      localStorage.setItem("connections_token", res.data.accessToken);
      setToken(res.data.accessToken);
      setPartner(res.data.partner);
      setAuthError("");
    },
    onError: (err: AxiosError<any>) => {
      setAuthError(err.response?.data?.error?.message ?? "Login failed");
    },
  });

  const bookingMutation = useMutation({
    mutationFn: () =>
      api.post("/connections/bookings", {
        ...formData,
        visitDate: selectedDate,
        arrivalTimeSlot: selectedSlot,
      }, { headers: { Authorization: `Bearer ${token}` } }),
    onSuccess: () => setSubmitted(true),
  });

  const { data: timeSlotsData } = useQuery({
    queryKey: ["slots", selectedDate],
    queryFn: () =>
      api.get<{ timeSlots: string[] }>("/public/availability", {
        params: { startDate: selectedDate, endDate: selectedDate, groupSize: 1 },
      }).then((r) => r.data.timeSlots),
    enabled: !!selectedDate,
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-aqua-900 to-aqua-700 flex items-center justify-center p-4">
        <div className="card w-full max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <Fish className="h-6 w-6 text-aqua-700" />
            <div>
              <h1 className="font-bold">Connections Partner Portal</h1>
              <p className="text-xs text-gray-500">Seattle Aquarium Education Programs</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {authError && <p className="text-red-600 text-sm">{authError}</p>}
            <button
              onClick={() => loginMutation.mutate()}
              disabled={loginMutation.isPending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <LogIn className="h-4 w-4" />
              {loginMutation.isPending ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-aqua-900 to-aqua-700 flex items-center justify-center p-4">
        <div className="card text-center max-w-md">
          <h2 className="text-xl font-bold mb-2">Visit Request Submitted</h2>
          <p className="text-gray-600">Your booking request has been received. You'll receive a confirmation email shortly.</p>
          <button onClick={() => setSubmitted(false)} className="btn-primary mt-4">Submit another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aqua-900 to-aqua-700 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <Fish className="h-8 w-8 text-white mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-white">Connections Partner Booking</h1>
          {partner && <p className="text-aqua-200">{partner.organizationName}</p>}
        </div>

        <div className="card space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Name</label>
              <input className="input" value={formData.contactName} onChange={(e) => setFormData((f) => ({ ...f, contactName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Contact Email</label>
              <input type="email" className="input" value={formData.contactEmail} onChange={(e) => setFormData((f) => ({ ...f, contactEmail: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                type="tel"
                inputMode="tel"
                placeholder="(206) 555-1234"
                className="input"
                value={formData.contactPhone}
                onChange={(e) => setFormData((f) => ({ ...f, contactPhone: formatPhone(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">Students</label>
              <input type="number" className="input" value={formData.studentCount} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setFormData((f) => ({ ...f, studentCount: +e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Select Visit Date</label>
            <AvailabilityCalendar
              groupSize={(formData.studentCount + formData.adultCount) || 1}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />
          </div>

          {selectedDate && (
            <div>
              <label className="label">Arrival Time</label>
              <select className="input" value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)}>
                <option value="">Select time…</option>
                {timeSlotsData?.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="rounded" checked={formData.cocAcknowledged} onChange={(e) => setFormData((f) => ({ ...f, cocAcknowledged: e.target.checked }))} />
              I acknowledge the Code of Conduct
            </label>
          </div>

          <button
            onClick={() => bookingMutation.mutate()}
            disabled={!selectedDate || !selectedSlot || !formData.cocAcknowledged || bookingMutation.isPending}
            className="btn-primary w-full"
          >
            {bookingMutation.isPending ? "Submitting…" : "Submit Visit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
