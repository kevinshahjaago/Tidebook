import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ScholarshipStatus } from "@tidebook/shared";

export default function AdminScholarships() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("");
  const [reviewing, setReviewing] = useState<{ id: string; decision: "APPROVED" | "DENIED"; notes: string; budget?: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-scholarships", filterStatus],
    queryFn: () =>
      api.get<{ data: any[] }>("/admin/scholarships", { params: { status: filterStatus || undefined } }).then((r) => r.data.data),
  });

  const reviewMutation = useMutation({
    mutationFn: (d: { id: string; decision: string; notes: string; budgetAllocated?: number }) =>
      api.post(`/admin/scholarships/${d.id}/review`, { decision: d.decision, notes: d.notes, budgetAllocated: d.budgetAllocated }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-scholarships"] }); setReviewing(null); },
  });

  const statusColors: Record<ScholarshipStatus, string> = {
    [ScholarshipStatus.SUBMITTED]: "bg-yellow-100 text-yellow-800",
    [ScholarshipStatus.UNDER_REVIEW]: "bg-blue-100 text-blue-800",
    [ScholarshipStatus.APPROVED]: "bg-green-100 text-green-800",
    [ScholarshipStatus.DENIED]: "bg-red-100 text-red-800",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Scholarship Applications</h1>

      <div className="card mb-4">
        <label className="label text-xs">Filter by Status</label>
        <select className="input text-sm w-48" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.values(ScholarshipStatus).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-gray-500 text-center py-8">Loading…</p>}
        {!isLoading && data?.length === 0 && <p className="text-gray-500 text-center py-8">No scholarship applications</p>}
        {data?.map((app) => (
          <div key={app.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <span className={`badge ${statusColors[app.status as ScholarshipStatus]}`}>{app.status}</span>
                <p className="font-medium mt-2">{app.booking?.visitDate} · Booking {app.bookingId.slice(0, 8)}</p>
                <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                  <p>Title I: {app.titleOneStatus ? "Yes" : "No"}</p>
                  <p>Enrollment: {app.enrollmentCount}</p>
                  {app.budgetAllocated && <p>Budget allocated: ${app.budgetAllocated}</p>}
                  {app.reviewNotes && <p className="text-gray-500 italic">"{app.reviewNotes}"</p>}
                </div>
              </div>
              {(app.status === ScholarshipStatus.SUBMITTED || app.status === ScholarshipStatus.UNDER_REVIEW) && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setReviewing({ id: app.id, decision: "APPROVED", notes: "", budget: undefined })}
                    className="btn-primary text-sm px-3 py-1.5"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setReviewing({ id: app.id, decision: "DENIED", notes: "" })}
                    className="btn-secondary text-sm px-3 py-1.5 border-red-300 text-red-700"
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>

            {reviewing !== null && reviewing.id === app.id && (
              <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">{reviewing.decision === "APPROVED" ? "Approve" : "Deny"} this application</p>
                <textarea
                  className="input text-sm w-full"
                  rows={2}
                  placeholder="Notes for record…"
                  value={reviewing.notes}
                  onChange={(e) => setReviewing((r) => r ? { ...r, notes: e.target.value } : null)}
                />
                {reviewing.decision === "APPROVED" && (
                  <div>
                    <label className="label text-xs">Budget Allocated ($)</label>
                    <input
                      type="number"
                      className="input text-sm w-32"
                      value={reviewing.budget ?? ""}
                      onChange={(e) => setReviewing((r) => r ? { ...r, budget: +e.target.value } : null)}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => reviewMutation.mutate({ id: reviewing.id, decision: reviewing.decision, notes: reviewing.notes, budgetAllocated: reviewing.budget })}
                    disabled={reviewMutation.isPending}
                    className="btn-primary text-sm px-4 py-2"
                  >
                    Confirm
                  </button>
                  <button onClick={() => setReviewing(null)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
