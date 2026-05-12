import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Download, Loader2, Users, School, DollarSign, TrendingUp,
  Clock, BarChart3, Bus, Award, XCircle, Settings2,
} from "lucide-react";

const PAYMENT_LABELS: Record<string, string> = {
  CASH_OR_CHECK: "Cash or Check",
  CREDIT_DEBIT: "Credit/Debit",
  ONLINE_PAYMENT_LINK: "Online Payment",
  INVOICE: "Purchase Order",
  SCHOLARSHIP: "Scholarship",
  PAID: "Paid (legacy)",
};

const GROUP_TYPE_LABELS: Record<string, string> = {
  SCHOOL: "School", HOMESCHOOL: "Home-School", CORPORATE: "Corporate", ADHOC: "Ad-Hoc Group", CONNECTIONS: "Connections",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending Review", CONFIRMED: "Confirmed", DECLINED: "Declined",
  CANCELLED: "Cancelled", COMPLETED: "Completed", WAITLISTED: "Waitlisted",
};

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-green-500", COMPLETED: "bg-emerald-500", PENDING: "bg-yellow-500",
  DECLINED: "bg-red-500", CANCELLED: "bg-gray-400", WAITLISTED: "bg-blue-400",
};

const SCHOLARSHIP_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-yellow-500", UNDER_REVIEW: "bg-blue-500", APPROVED: "bg-green-500", DENIED: "bg-red-500",
};

function StatCard({ icon: Icon, label, value, sub, color = "aqua" }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    aqua: "bg-aqua-50 text-aqua-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="card flex items-start gap-4">
      <div className={`rounded-xl p-3 ${colorMap[color] ?? colorMap.aqua}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [exporting, setExporting] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState(false);
  const [revenueInput, setRevenueInput] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/admin/analytics/bookings", {
        params: { seasonStartDate: dateRange.from || undefined, seasonEndDate: dateRange.to || undefined, format: "csv" },
        responseType: "blob",
      });
      const suffix = dateRange.from && dateRange.to ? `${dateRange.from}-to-${dateRange.to}` : "all";
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = `analytics-${suffix}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", dateRange],
    queryFn: () => api.get<any>("/admin/analytics/bookings", {
      params: { seasonStartDate: dateRange.from || undefined, seasonEndDate: dateRange.to || undefined },
    }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const saveRevenueMutation = useMutation({
    mutationFn: (value: string) => api.put("/admin/settings/per_student_revenue", { value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["analytics"] }); setEditingRevenue(false); },
  });

  const saveBudgetMutation = useMutation({
    mutationFn: (value: string) => api.put("/admin/settings/transportation_budget_per_season", { value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["analytics"] }); setEditingBudget(false); },
  });

  const d = data ?? {};
  const maxStatusCount = Math.max(...(d.totalByStatus?.map((r: any) => r._count) ?? [1]));

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Season Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">End-of-season review and visit analytics</p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-secondary flex items-center gap-2 text-sm">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Date filter */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label text-xs">Season Start</label>
            <input type="date" className="input text-sm" value={dateRange.from} onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div>
            <label className="label text-xs">Season End</label>
            <input type="date" className="input text-sm" value={dateRange.to} onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          {(dateRange.from || dateRange.to) && (
            <button onClick={() => setDateRange({ from: "", to: "" })} className="text-xs text-gray-500 hover:text-gray-700 underline pb-1">Clear</button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-aqua-500" /></div>
      ) : (
        <div className="space-y-6">
          {/* KPI stat grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={School} label="Confirmed Visits" value={d.totalConfirmedBookings ?? 0} color="aqua" />
            <StatCard icon={School} label="Unique Organizations" value={d.uniqueOrganizations ?? 0} sub={`${d.uniqueDistricts ?? 0} districts`} color="blue" />
            <StatCard icon={Users} label="Total Students" value={(d.totalStudents ?? 0).toLocaleString()} sub={`avg ${d.avgGroupSize ?? 0} per group`} color="green" />
            <StatCard icon={Users} label="Total Visitors" value={(d.totalVisitors ?? 0).toLocaleString()} sub={`${(d.totalAdults ?? 0).toLocaleString()} chaperones`} color="purple" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Clock} label="Avg Lead Time" value={`${d.avgLeadTimeDays ?? 0} days`} sub="booking to visit" color="amber" />
            <StatCard icon={XCircle} label="Cancellation Rate" value={`${d.cancellationRate ?? 0}%`} color="amber" />
            <StatCard icon={Award} label="Scholarship Apps" value={d.scholarshipStats?.reduce((s: number, r: any) => s + r._count, 0) ?? 0} color="green" />
            <StatCard icon={Bus} label="Transport Requests" value={d.transportReimbursementsCount ?? 0} color="blue" />
          </div>

          {/* Revenue section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-aqua-600" />Program Revenue</h2>
                <button onClick={() => { setRevenueInput(d.perStudentRevenue?.toString() ?? "0"); setEditingRevenue(true); }} className="flex items-center gap-1 text-xs text-aqua-600 hover:text-aqua-800">
                  <Settings2 className="h-3.5 w-3.5" /> Set rate
                </button>
              </div>
              {editingRevenue ? (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-gray-600">$ per student:</span>
                  <input
                    type="number" step="0.01" min="0" className="input text-sm w-28"
                    value={revenueInput}
                    onChange={(e) => setRevenueInput(e.target.value)}
                    autoFocus
                  />
                  <button onClick={() => saveRevenueMutation.mutate(revenueInput)} disabled={saveRevenueMutation.isPending} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  <button onClick={() => setEditingRevenue(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-4">Rate: <strong>${d.perStudentRevenue?.toFixed(2) ?? "0.00"}</strong> per paying student</p>
              )}
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-600">Paying students</span>
                  <span className="font-medium">{(d.payingStudents ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Estimated revenue</span>
                  <span className="text-xl font-bold text-green-700">${(d.estimatedRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </dl>
            </div>

            {/* Transportation budget */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2"><Bus className="h-4 w-4 text-blue-600" />Transportation Budget</h2>
                <button onClick={() => { setBudgetInput(d.transportBudget?.toString() ?? "0"); setEditingBudget(true); }} className="flex items-center gap-1 text-xs text-aqua-600 hover:text-aqua-800">
                  <Settings2 className="h-3.5 w-3.5" /> Set budget
                </button>
              </div>
              {editingBudget ? (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-gray-600">Season budget $:</span>
                  <input
                    type="number" step="0.01" min="0" className="input text-sm w-32"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    autoFocus
                  />
                  <button onClick={() => saveBudgetMutation.mutate(budgetInput)} disabled={saveBudgetMutation.isPending} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  <button onClick={() => setEditingBudget(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              ) : null}
              {(() => {
                const budget = d.transportBudget ?? 0;
                const spent = d.transportTotalApproved ?? 0;
                const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
                const remaining = Math.max(0, budget - spent);
                return (
                  <div className="space-y-3">
                    {budget > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Used: ${spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-600">Season budget</span>
                        <span className="font-medium">${budget > 0 ? budget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Not set"}</span>
                      </div>
                      <div className="flex justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-600">Approved reimbursements</span>
                        <span className="font-medium">${spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      {budget > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 font-medium">Remaining</span>
                          <span className={`font-bold ${remaining < budget * 0.2 ? "text-red-600" : "text-green-700"}`}>
                            ${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </dl>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Status breakdown + group type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-aqua-600" />Visit Requests by Status</h2>
              <div className="space-y-3">
                {d.totalByStatus?.map((row: any) => (
                  <div key={row.status} className="flex items-center gap-3 text-sm">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[row.status] ?? "bg-gray-400"}`} />
                    <span className="text-gray-700 w-36">{STATUS_LABELS[row.status] ?? row.status}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${STATUS_COLORS[row.status] ?? "bg-gray-400"}`} style={{ width: `${maxStatusCount ? (row._count / maxStatusCount) * 100 : 0}%` }} />
                    </div>
                    <span className="font-semibold w-8 text-right">{row._count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><School className="h-4 w-4 text-aqua-600" />Confirmed Visits by Group Type</h2>
              <div className="space-y-3">
                {d.totalByGroupType?.map((row: any) => {
                  const total = d.totalByGroupType.reduce((s: number, r: any) => s + r._count, 0);
                  return (
                    <div key={row.groupType} className="flex items-center gap-3 text-sm">
                      <span className="text-gray-700 w-36">{GROUP_TYPE_LABELS[row.groupType] ?? row.groupType}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-aqua-500" style={{ width: `${total ? (row._count / total) * 100 : 0}%` }} />
                      </div>
                      <span className="font-semibold w-8 text-right">{row._count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Payment + Scholarship */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><DollarSign className="h-4 w-4 text-aqua-600" />Payment Methods</h2>
              <div className="space-y-2">
                {d.totalByPaymentMethod?.map((row: any) => (
                  <div key={row.paymentMethod} className="flex justify-between text-sm">
                    <span className="text-gray-700">{PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod}</span>
                    <span className="font-semibold">{row._count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Award className="h-4 w-4 text-aqua-600" />Scholarship Applications</h2>
              <div className="space-y-3">
                {d.scholarshipStats?.length === 0 && <p className="text-sm text-gray-400">No scholarship applications in this period.</p>}
                {d.scholarshipStats?.map((row: any) => (
                  <div key={row.status} className="flex items-center gap-3 text-sm">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SCHOLARSHIP_STATUS_COLORS[row.status] ?? "bg-gray-400"}`} />
                    <span className="text-gray-700 flex-1">{row.status.replace(/_/g, " ")}</span>
                    <span className="font-semibold">{row._count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Grade breakdown + top districts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-aqua-600" />Students by Grade Level</h2>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {d.gradeBreakdown?.map((row: any) => {
                  const max = d.gradeBreakdown?.[0]?.count ?? 1;
                  return (
                    <div key={row.grade} className="flex items-center gap-3 text-sm">
                      <span className="text-gray-700 w-40 truncate">{row.grade}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-aqua-400" style={{ width: `${(row.count / max) * 100}%` }} />
                      </div>
                      <span className="font-medium w-12 text-right">{row.count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><School className="h-4 w-4 text-aqua-600" />Top School Districts</h2>
              {d.topDistricts?.length === 0 && <p className="text-sm text-gray-400">No district data available.</p>}
              <div className="space-y-2">
                {d.topDistricts?.map((row: any, i: number) => (
                  <div key={row.district} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-400 font-medium w-5 text-right">{i + 1}.</span>
                    <span className="text-gray-700 flex-1 truncate">{row.district}</span>
                    <span className="font-semibold">{row.count} visit{row.count !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly visit volume */}
          <div className="card">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-aqua-600" />Daily Visit Volume</h2>
            {d.monthlyVisits?.length === 0 && <p className="text-sm text-gray-400">No visit data in this period.</p>}
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 min-w-0" style={{ minHeight: 80 }}>
                {(() => {
                  const visits = d.monthlyVisits ?? [];
                  if (visits.length === 0) return null;
                  const maxStudents = Math.max(...visits.map((v: any) => v._sum?.studentCount ?? 0), 1);
                  return visits.map((v: any) => {
                    const students = v._sum?.studentCount ?? 0;
                    const h = Math.max(4, Math.round((students / maxStudents) * 72));
                    return (
                      <div key={v.visitDate} className="flex flex-col items-center group cursor-default" style={{ minWidth: 6 }}>
                        <div
                          className="w-full bg-aqua-500 rounded-t hover:bg-aqua-600 transition-colors relative"
                          style={{ height: h }}
                          title={`${v.visitDate}: ${students} students, ${v._count} groups`}
                        />
                      </div>
                    );
                  });
                })()}
              </div>
              {d.monthlyVisits?.length > 0 && (
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
                  <span>{d.monthlyVisits[0]?.visitDate}</span>
                  <span>{d.monthlyVisits[d.monthlyVisits.length - 1]?.visitDate}</span>
                </div>
              )}
            </div>
            <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100 text-sm">
              <div>
                <span className="text-gray-500">Total visit days:</span>{" "}
                <span className="font-semibold">{d.monthlyVisits?.length ?? 0}</span>
              </div>
              <div>
                <span className="text-gray-500">Peak students/day:</span>{" "}
                <span className="font-semibold">{Math.max(...(d.monthlyVisits?.map((v: any) => v._sum?.studentCount ?? 0) ?? [0])).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
