import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { BookingStatus, GroupType } from "@tidebook/shared";
import { Download, Loader2 } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", CONFIRMED: "Confirmed", DECLINED: "Declined",
  CANCELLED: "Cancelled", COMPLETED: "Completed", WAITLISTED: "Waitlisted",
};

export default function AdminAnalytics() {
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/admin/analytics/bookings", {
        params: {
          seasonStartDate: dateRange.from || undefined,
          seasonEndDate: dateRange.to || undefined,
          format: "csv",
        },
        responseType: "blob",
      });
      const suffix = dateRange.from && dateRange.to ? `${dateRange.from}-to-${dateRange.to}` : "all";
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${suffix}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", dateRange],
    queryFn: () =>
      api.get<any>("/admin/analytics/bookings", {
        params: { seasonStartDate: dateRange.from || undefined, seasonEndDate: dateRange.to || undefined },
      }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const totalBookings = data?.totalByStatus?.reduce((s: number, x: any) => s + x._count, 0) ?? 0;
  const totalVisitors = data?.monthlyTotals?.reduce((s: number, x: any) => s + (x._sum?.studentCount ?? 0) + (x._sum?.adultCount ?? 0), 0) ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <button onClick={handleExport} disabled={exporting} className="btn-secondary flex items-center gap-2 text-sm">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label text-xs">From</label>
            <input type="date" className="input text-sm" value={dateRange.from} onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div>
            <label className="label text-xs">To</label>
            <input type="date" className="input text-sm" value={dateRange.to} onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          {(dateRange.from || dateRange.to) && (
            <button onClick={() => setDateRange({ from: "", to: "" })} className="text-xs text-gray-500 hover:text-gray-700 underline pb-1">
              Clear filter
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-500 py-8">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-semibold mb-4">Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Bookings</span>
                <span className="font-bold text-lg">{totalBookings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Visitors</span>
                <span className="font-bold text-lg">{totalVisitors}</span>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-4">By Status</h2>
            <div className="space-y-2">
              {data?.totalByStatus?.map((row: any) => (
                <div key={row.status} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{STATUS_LABELS[row.status] ?? row.status}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 bg-aqua-200 rounded-full w-24 overflow-hidden">
                      <div
                        className="h-full bg-aqua-600 rounded-full"
                        style={{ width: `${totalBookings ? (row._count / totalBookings) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="font-medium w-8 text-right">{row._count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-4">By Group Type</h2>
            <div className="space-y-2">
              {data?.totalByGroupType?.map((row: any) => (
                <div key={row.groupType} className="flex justify-between text-sm">
                  <span className="text-gray-700">{row.groupType}</span>
                  <span className="font-medium">{row._count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-4">By Payment Method</h2>
            <div className="space-y-2">
              {data?.totalByPaymentMethod?.map((row: any) => (
                <div key={row.paymentMethod} className="flex justify-between text-sm">
                  <span className="text-gray-700">{row.paymentMethod}</span>
                  <span className="font-medium">{row._count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
