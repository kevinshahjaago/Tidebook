import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ClassOffering } from "@tidebook/shared";
import { Plus, Edit2, X, Clock } from "lucide-react";

const emptyClass: Omit<ClassOffering, "id"> = {
  name: "", description: "", gradeMin: 1, gradeMax: 8, durationMinutes: 60, capacity: 30,
  resourceRequirements: "", availableTimeSlots: null, isActive: true,
};

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${m} ${hour < 12 ? "AM" : "PM"}`;
}

export default function AdminClasses() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyClass);
  const [newSlotInput, setNewSlotInput] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-classes"],
    queryFn: () => api.get<{ classes: ClassOffering[] }>("/admin/classes").then((r) => r.data.classes),
  });

  const saveMutation = useMutation({
    mutationFn: (d: { id?: string; data: typeof emptyClass }) =>
      d.id ? api.put(`/admin/classes/${d.id}`, d.data) : api.post("/admin/classes", d.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-classes"] }); setEditing(null); setCreating(false); setForm(emptyClass); },
  });

  function startEdit(cls: ClassOffering) {
    setEditing(cls.id);
    setForm({ name: cls.name, description: cls.description, gradeMin: cls.gradeMin, gradeMax: cls.gradeMax, durationMinutes: cls.durationMinutes, capacity: cls.capacity, resourceRequirements: cls.resourceRequirements ?? "", availableTimeSlots: cls.availableTimeSlots, isActive: cls.isActive });
    setNewSlotInput("");
  }

  const parsedSlots: string[] = (() => {
    try { return JSON.parse(form.availableTimeSlots ?? "[]"); } catch { return []; }
  })();

  const addSlot = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || parsedSlots.includes(trimmed)) return;
    const next = [...parsedSlots, trimmed].sort();
    setForm((f) => ({ ...f, availableTimeSlots: JSON.stringify(next) }));
    setNewSlotInput("");
  };

  const removeSlot = (slot: string) => {
    const next = parsedSlots.filter((s) => s !== slot);
    setForm((f) => ({ ...f, availableTimeSlots: next.length > 0 ? JSON.stringify(next) : null }));
  };

  const ClassForm = ({ id }: { id?: string }) => (
    <div className="grid grid-cols-2 gap-3 mt-2 bg-gray-50 rounded-lg p-4">
      <div className="col-span-2">
        <label className="label text-xs">Program name</label>
        <input className="input text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="col-span-2">
        <label className="label text-xs">Description</label>
        <textarea rows={2} className="input text-sm" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div>
        <label className="label text-xs">Youngest grade served</label>
        <input type="number" className="input text-sm" value={form.gradeMin} onChange={(e) => setForm((f) => ({ ...f, gradeMin: +e.target.value }))} />
      </div>
      <div>
        <label className="label text-xs">Oldest grade served</label>
        <input type="number" className="input text-sm" value={form.gradeMax} onChange={(e) => setForm((f) => ({ ...f, gradeMax: +e.target.value }))} />
      </div>
      <div>
        <label className="label text-xs">Maximum students per session</label>
        <input type="number" className="input text-sm" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: +e.target.value }))} />
      </div>
      <div>
        <label className="label text-xs">Program length (minutes)</label>
        <input type="number" className="input text-sm" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: +e.target.value }))} />
      </div>
      <div className="col-span-2">
        <label className="label text-xs">What you'll need (staff, equipment, space)</label>
        <input className="input text-sm" value={form.resourceRequirements ?? ""} onChange={(e) => setForm((f) => ({ ...f, resourceRequirements: e.target.value }))} />
      </div>
      <div className="col-span-2">
        <label className="label text-xs flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Available time slots for this program</label>
        <p className="text-xs text-gray-500 mb-2">
          Add the specific times this program runs. Guests will pick one when booking. Leave empty to allow any arrival time.
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {parsedSlots.map((slot) => (
            <span key={slot} className="inline-flex items-center gap-1 bg-aqua-50 border border-aqua-200 text-aqua-800 text-xs rounded-full px-3 py-1">
              {formatTime(slot)}
              <button type="button" onClick={() => removeSlot(slot)} className="ml-1 hover:text-red-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {parsedSlots.length === 0 && <span className="text-xs text-gray-400 italic">No times set — any arrival time allowed</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            className="input text-sm w-36"
            value={newSlotInput}
            onChange={(e) => setNewSlotInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSlot(newSlotInput); } }}
          />
          <button type="button" onClick={() => addSlot(newSlotInput)} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Add time
          </button>
        </div>
      </div>
      <div className="col-span-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Available for groups to book
        </label>
      </div>
      <div className="col-span-2 flex gap-2">
        <button onClick={() => saveMutation.mutate({ id, data: form })} disabled={saveMutation.isPending} className="btn-primary text-sm px-4 py-2">
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
        <button onClick={() => { setEditing(null); setCreating(false); setForm(emptyClass); }} className="btn-secondary text-sm px-4 py-2">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">On-Site Programs</h1>
          <p className="text-gray-500 text-sm mt-0.5">Facilitated programs guests can add to their visit.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" />
          Add Program
        </button>
      </div>

      {creating && (
        <div className="card mb-4">
          <h2 className="font-semibold mb-2">New On-Site Program</h2>
          <ClassForm />
        </div>
      )}

      <div className="space-y-3">
        {data?.map((cls) => (
          <div key={cls.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{cls.name}</h3>
                  <span className={`badge ${cls.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                    {cls.isActive ? "Available to book" : "Not available"}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{cls.description}</p>
                <div className="flex flex-wrap gap-4 text-xs text-gray-500 mt-2">
                  <span>Grades {cls.gradeMin}–{cls.gradeMax}</span>
                  <span>Up to {cls.capacity} students</span>
                  <span>{cls.durationMinutes} minutes</span>
                  {cls.resourceRequirements && <span>Needs: {cls.resourceRequirements}</span>}
                  {cls.availableTimeSlots && (() => {
                    try {
                      const slots: string[] = JSON.parse(cls.availableTimeSlots);
                      return slots.length > 0 ? <span>Times: {slots.map(formatTime).join(", ")}</span> : null;
                    } catch { return null; }
                  })()}
                </div>
              </div>
              <button onClick={() => startEdit(cls)} className="p-1.5 hover:bg-gray-100 rounded">
                <Edit2 className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            {editing === cls.id && <ClassForm id={cls.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}
