import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Season } from "@tidebook/shared";
import { Plus, Calendar } from "lucide-react";

export default function AdminSeasons() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "", startDate: "", endDate: "", registrationOpensAt: "", registrationClosesAt: "",
    defaultDailyCapacity: 300, isPublished: false,
  });

  const { data } = useQuery({
    queryKey: ["admin-seasons"],
    queryFn: () => api.get<{ seasons: Season[] }>("/admin/seasons").then((r) => r.data.seasons),
  });

  const toISO = (local: string) => local ? new Date(local).toISOString() : "";

  const createMutation = useMutation({
    mutationFn: () => api.post("/admin/seasons", {
      ...form,
      registrationOpensAt: toISO(form.registrationOpensAt),
      registrationClosesAt: toISO(form.registrationClosesAt),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-seasons"] }); setCreating(false); },
  });

  const updateMutation = useMutation({
    mutationFn: (s: Season) => api.put(`/admin/seasons/${s.id}`, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-seasons"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Seasons & Capacity</h1>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" />
          New Season
        </button>
      </div>

      {creating && (
        <div className="card mb-4">
          <h2 className="font-semibold mb-4">New Season</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label text-xs">Season Name</label>
              <input className="input text-sm" placeholder="e.g. 2026–2027" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Start Date</label>
              <input type="date" className="input text-sm" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">End Date</label>
              <input type="date" className="input text-sm" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Registration Opens</label>
              <input type="datetime-local" className="input text-sm" value={form.registrationOpensAt} onChange={(e) => setForm((f) => ({ ...f, registrationOpensAt: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Registration Closes</label>
              <input type="datetime-local" className="input text-sm" value={form.registrationClosesAt} onChange={(e) => setForm((f) => ({ ...f, registrationClosesAt: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Default daily visitor limit</label>
              <input type="number" className="input text-sm" value={form.defaultDailyCapacity} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setForm((f) => ({ ...f, defaultDailyCapacity: +e.target.value }))} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="rounded" checked={form.isPublished} onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))} />
                Open for bookings (makes the booking form live)
              </label>
            </div>
          </div>
          {createMutation.isError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {(createMutation.error as any)?.response?.data?.error ?? "Failed to create season. Check all fields and try again."}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="btn-primary text-sm px-4 py-2">
              {createMutation.isPending ? "Creating…" : "Create Season"}
            </button>
            <button onClick={() => setCreating(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {data?.map((season) => (
          <div key={season.id} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-aqua-600" />
                <div>
                  <h3 className="font-medium">{season.name}</h3>
                  <p className="text-sm text-gray-600">{season.startDate} → {season.endDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${season.isPublished ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                  {season.isPublished ? "Open for bookings" : "Not yet open"}
                </span>
                <button
                  onClick={() => updateMutation.mutate({ ...season, isPublished: !season.isPublished })}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  {season.isPublished ? "Close bookings" : "Open for bookings"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3 text-sm text-gray-600">
              <span>Up to <strong>{season.defaultDailyCapacity}</strong> visitors/day</span>
              <span>Opens: {new Date(season.registrationOpensAt).toLocaleDateString()}</span>
              <span>Closes: {new Date(season.registrationClosesAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
