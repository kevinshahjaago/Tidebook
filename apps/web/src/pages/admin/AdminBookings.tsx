import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { BookingStatus, GroupType, Booking, PaginatedResponse } from "@tidebook/shared";
import { Search, Filter, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function AdminBookings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dvlExporting, setDvlExporting] = useState(false);

  const handleDvlExport = async () => {
    setDvlExporting(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const res = await api.get("/admin/dvl", {
        params: { date: today, format: "csv" },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `dvl-${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDvlExporting(false);
    }
  };

  const status = searchParams.get("status") ?? "";
  const groupType = searchParams.get("groupType") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");

  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");

  const applySearch = () => {
    setSearchParams((p) => {
      if (searchInput.trim()) p.set("search", searchInput.trim());
      else p.delete("search");
      p.set("page", "1");
      return p;
    });
  };

  const searchParam = searchParams.get("search") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["admin-bookings", { status, groupType, dateFrom, dateTo, page, search: searchParam }],
    queryFn: () =>
      api.get<PaginatedResponse<Booking>>("/admin/bookings", {
        params: {
          status: status || undefined,
          groupType: groupType || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: searchParam || undefined,
          page,
          limit: 25,
        },
      }).then((r) => r.data),
    staleTime: 30_000,
  });

  function setFilter(key: string, value: string) {
    setSearchParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      p.set("page", "1");
      return p;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <button
          onClick={handleDvlExport}
          disabled={dvlExporting}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          {dvlExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {dvlExporting ? "Exporting…" : "Today's Visit Log"}
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="label text-xs">Visit status</label>
            <select className="input text-sm" value={status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">All statuses</option>
              <option value={BookingStatus.PENDING}>Awaiting response</option>
              <option value={BookingStatus.CONFIRMED}>Confirmed</option>
              <option value={BookingStatus.DECLINED}>Declined</option>
              <option value={BookingStatus.CANCELLED}>Cancelled</option>
              <option value={BookingStatus.COMPLETED}>Completed</option>
              <option value={BookingStatus.WAITLISTED}>Waitlisted</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">Group type</label>
            <select className="input text-sm" value={groupType} onChange={(e) => setFilter("groupType", e.target.value)}>
              <option value="">All group types</option>
              <option value={GroupType.SCHOOL}>School Group</option>
              <option value={GroupType.HOMESCHOOL}>Home-School Family</option>
              <option value={GroupType.CORPORATE}>Corporate Group</option>
              <option value={GroupType.ADHOC}>Ad-Hoc Group</option>
              <option value={GroupType.CONNECTIONS}>Connections Partner</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">From Date</label>
            <input type="date" className="input text-sm" value={dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">To Date</label>
            <input type="date" className="input text-sm" value={dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="input text-sm pl-9"
              placeholder="Search school or contact name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
            />
          </div>
          <button onClick={applySearch} className="btn-secondary text-sm px-4">Search</button>
          {searchParam && (
            <button
              onClick={() => { setSearchInput(""); setFilter("search", ""); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-700">Organization</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden sm:table-cell whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden md:table-cell">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden md:table-cell">Size</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden lg:table-cell">Payment</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading…</td>
                </tr>
              )}
              {!isLoading && data?.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No bookings found</td>
                </tr>
              )}
              {data?.data.map((booking) => (
                <tr key={booking.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{booking.organizationName}</div>
                    <div className="text-xs text-gray-500">{booking.contactName}</div>
                    <div className="text-xs text-gray-400 sm:hidden mt-0.5">{booking.visitDate} · {booking.arrivalTimeSlot}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 hidden sm:table-cell whitespace-nowrap">{booking.visitDate}</td>
                  <td className="px-4 py-3 text-gray-700 hidden md:table-cell">{booking.arrivalTimeSlot}</td>
                  <td className="px-4 py-3 text-gray-700 hidden md:table-cell">{booking.studentCount + booking.adultCount}</td>
                  <td className="px-4 py-3 text-gray-700 hidden lg:table-cell">{booking.paymentMethod}</td>
                  <td className="px-4 py-3"><StatusBadge status={booking.status} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/bookings/${booking.id}`} className="text-aqua-700 hover:underline text-xs font-medium whitespace-nowrap">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("page", String(page - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                Previous
              </button>
              <button
                onClick={() => setFilter("page", String(page + 1))}
                disabled={page === data.pagination.totalPages}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
