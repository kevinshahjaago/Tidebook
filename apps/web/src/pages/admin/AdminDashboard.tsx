import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { BookOpen, CheckCircle, Clock, Users, TrendingUp } from "lucide-react";
import { StatusBadge } from "../../components/StatusBadge";
import { BookingStatus, Booking, PaginatedResponse } from "@tidebook/shared";

export default function AdminDashboard() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: pendingData } = useQuery({
    queryKey: ["admin-bookings-pending"],
    queryFn: () =>
      api.get<PaginatedResponse<Booking>>("/admin/bookings", {
        params: { status: BookingStatus.PENDING, limit: 10 },
      }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: todayData } = useQuery({
    queryKey: ["admin-bookings-today"],
    queryFn: () =>
      api.get<PaginatedResponse<Booking>>("/admin/bookings", {
        params: { dateFrom: today, dateTo: today, limit: 20 },
      }).then((r) => r.data),
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () =>
      api.get<any>("/admin/analytics/bookings").then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const confirmedCount = analyticsData?.totalByStatus?.find((s: any) => s.status === "CONFIRMED")?._count ?? 0;
  const pendingCount = pendingData?.pagination.total ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Clock className="h-6 w-6 text-amber-600" />}
          label="Awaiting Your Response"
          value={pendingCount}
          bg="bg-amber-50"
          linkTo="/admin/bookings?status=PENDING"
        />
        <StatCard
          icon={<CheckCircle className="h-6 w-6 text-green-600" />}
          label="Confirmed Visits This Season"
          value={confirmedCount}
          bg="bg-green-50"
          linkTo="/admin/bookings?status=CONFIRMED"
        />
        <StatCard
          icon={<BookOpen className="h-6 w-6 text-aqua-600" />}
          label="Groups Visiting Today"
          value={todayData?.pagination.total ?? 0}
          bg="bg-aqua-50"
          linkTo={`/admin/dvl?date=${today}`}
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6 text-purple-600" />}
          label="All Visit Requests"
          value={analyticsData?.totalByStatus?.reduce((sum: number, s: any) => sum + s._count, 0) ?? 0}
          bg="bg-purple-50"
          linkTo="/admin/bookings"
        />
      </div>

      {/* Pending review queue */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Awaiting Your Response</h2>
          <Link to="/admin/bookings?status=PENDING" className="text-sm text-aqua-700 hover:underline">
            View all
          </Link>
        </div>

        {pendingData?.data.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-6">You're all caught up — no visits are waiting for a response.</p>
        )}

        <div className="space-y-3">
          {pendingData?.data.map((booking) => (
            <Link
              key={booking.id}
              to={`/admin/bookings/${booking.id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors"
            >
              <div>
                <div className="font-medium text-sm">{booking.organizationName}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {booking.visitDate} at {booking.arrivalTimeSlot} · {booking.studentCount + booking.adultCount} people
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={booking.status} />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Today's visits */}
      {todayData && todayData.data.length > 0 && (
        <div className="card mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Today's Visits</h2>
            <Link to={`/admin/dvl?date=${today}`} className="text-sm text-aqua-700 hover:underline">
              Full log
            </Link>
          </div>
          <div className="space-y-2">
            {todayData.data.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <div className="text-sm font-medium">{booking.organizationName}</div>
                  <div className="text-xs text-gray-500">{booking.arrivalTimeSlot} · {booking.studentCount + booking.adultCount} people</div>
                </div>
                <StatusBadge status={booking.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  bg,
  linkTo,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  bg: string;
  linkTo: string;
}) {
  return (
    <Link to={linkTo} className={`card flex items-center gap-4 hover:shadow-md transition-shadow ${bg}`}>
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-gray-600">{label}</div>
      </div>
    </Link>
  );
}
