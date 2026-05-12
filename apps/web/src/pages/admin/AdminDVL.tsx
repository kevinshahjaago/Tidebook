import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";

interface DVLRow {
  date: string;
  time: string;
  groupName: string;
  groupType: string;
  students: number;
  adults: number;
  total: number;
  class: string;
  paymentMethod: string;
  acmeOrderNumber: string;
  scholarshipStatus: string;
  contactName: string;
  contactEmail: string;
}

export default function AdminDVL() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dvl", date],
    queryFn: () => api.get<{ data: DVLRow[]; count: number }>("/admin/dvl", { params: { date } }).then((r) => r.data),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/admin/dvl", {
        params: { date, format: "csv" },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `dvl-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daily Visit Log</h1>
        <button onClick={handleExport} disabled={exporting} className="btn-secondary flex items-center gap-2 text-sm">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="card mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="label text-xs">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {data && (
            <div className="sm:pt-5 text-sm text-gray-600">
              {data.count} visit{data.count !== 1 ? "s" : ""} ·{" "}
              {data.data.reduce((sum, r) => sum + r.total, 0)} total visitors
            </div>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-700 whitespace-nowrap">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Group</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden sm:table-cell">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 whitespace-nowrap">Students</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden sm:table-cell">Adults</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden sm:table-cell">Total</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden md:table-cell">Class</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden md:table-cell">Payment</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden lg:table-cell whitespace-nowrap">ACME Order</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden lg:table-cell">Scholarship</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 hidden md:table-cell">Contact</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
              )}
              {!isLoading && data?.data.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-500">No visits on this date</td></tr>
              )}
              {data?.data.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{row.time}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.groupName}</div>
                    <div className="text-xs text-gray-500 sm:hidden">{row.groupType} · {row.students}+{row.adults}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{row.groupType}</td>
                  <td className="px-4 py-3 text-center">{row.students}</td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">{row.adults}</td>
                  <td className="px-4 py-3 text-center font-medium hidden sm:table-cell">{row.total}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{row.class || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{row.paymentMethod}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs hidden lg:table-cell">{row.acmeOrderNumber || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{row.scholarshipStatus || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs hidden md:table-cell">{row.contactName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
