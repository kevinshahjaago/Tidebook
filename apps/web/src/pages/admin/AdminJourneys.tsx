import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Mail, Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight,
  Clock, Edit3, Check, X, Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimingType = "immediately" | "days_before_visit" | "days_after_trigger";

type JourneyStep = {
  id: string;
  type: "send_email";
  templateType: string;
  label: string;
  timing: { type: TimingType; days?: number };
};

type Journey = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  isEnabled: boolean;
  steps: JourneyStep[];
  sortOrder: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  BOOKING_SUBMITTED: "When a visit request is submitted",
  BOOKING_CONFIRMED: "When a visit is confirmed",
  BOOKING_DECLINED: "When a visit is declined",
  BOOKING_RESCHEDULED_BY_ADMIN: "When a visit is rescheduled by your team",
  BOOKING_RESCHEDULED_BY_BOOKER: "When a visit is rescheduled by the group",
  BOOKING_CANCELLED: "When a visit is cancelled",
};

const TRIGGER_OPTIONS = Object.entries(TRIGGER_LABELS);

// Journeys are grouped visually to show branching pattern
type SectionDef = {
  key: string;
  title: string;
  description: string;
  triggers: string[];
};

const SECTIONS: SectionDef[] = [
  {
    key: "submitted",
    title: "Visit Request Submitted",
    description: "Fires as soon as a group submits their booking request.",
    triggers: ["BOOKING_SUBMITTED"],
  },
  {
    key: "reviewed",
    title: "Visit Request Reviewed",
    description: "Fires when your team confirms or declines a request.",
    triggers: ["BOOKING_CONFIRMED", "BOOKING_DECLINED"],
  },
  {
    key: "rescheduled",
    title: "Visit Rescheduled",
    description: "Fires when a visit date is changed.",
    triggers: ["BOOKING_RESCHEDULED_BY_ADMIN", "BOOKING_RESCHEDULED_BY_BOOKER"],
  },
  {
    key: "cancelled",
    title: "Visit Cancelled",
    description: "Fires when a booking is cancelled.",
    triggers: ["BOOKING_CANCELLED"],
  },
];

const TEMPLATE_OPTIONS = [
  { value: "BOOKING_PENDING_REVIEW",          label: "Booking received (pending review)" },
  { value: "BOOKING_CONFIRMED_STANDARD",      label: "Booking confirmed (auto)" },
  { value: "BOOKING_CONFIRMED_BY_REGISTRAR",  label: "Booking confirmed (by staff)" },
  { value: "BOOKING_DECLINED",                label: "Booking declined" },
  { value: "RESCHEDULE_COMPLETED",            label: "Reschedule confirmed" },
  { value: "RESCHEDULE_PENDING_REVIEW",       label: "Reschedule request received" },
  { value: "REMINDER_14_DAYS",                label: "14-day visit reminder" },
  { value: "POST_VISIT_SURVEY",               label: "Post-visit survey" },
  { value: "SCHOLARSHIP_APPROVED",            label: "Scholarship approved" },
  { value: "BUS_REIMBURSEMENT_INFO",          label: "Bus reimbursement info" },
  { value: "ONLINE_PAYMENT_LINK_INFO",        label: "Online payment link" },
];

const TIMING_LABELS: Record<TimingType, string> = {
  immediately: "Immediately",
  days_before_visit: "days before visit",
  days_after_trigger: "days after this event",
};

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step, onRemove, onEdit }: {
  step: JourneyStep;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const template = TEMPLATE_OPTIONS.find((t) => t.value === step.templateType);
  const timingText = step.timing.type === "immediately"
    ? "Immediately"
    : `${step.timing.days ?? 0} ${TIMING_LABELS[step.timing.type]}`;

  return (
    <div className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-3 shadow-sm group">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-aqua-50 flex items-center justify-center mt-0.5">
        <Mail className="h-4 w-4 text-aqua-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{template?.label ?? step.templateType}</p>
        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
          <Clock className="h-3 w-3" />{timingText}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700">
          <Edit3 className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRemove} className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Add step form ─────────────────────────────────────────────────────────────

function AddStepForm({ onAdd, onCancel }: {
  onAdd: (step: JourneyStep) => void;
  onCancel: () => void;
}) {
  const [templateType, setTemplateType] = useState("BOOKING_PENDING_REVIEW");
  const [timingType, setTimingType] = useState<TimingType>("immediately");
  const [days, setDays] = useState(7);

  const handleAdd = () => {
    const template = TEMPLATE_OPTIONS.find((t) => t.value === templateType);
    onAdd({
      id: Math.random().toString(36).slice(2),
      type: "send_email",
      templateType,
      label: template?.label ?? templateType,
      timing: { type: timingType, ...(timingType !== "immediately" ? { days } : {}) },
    });
  };

  return (
    <div className="border border-aqua-200 bg-aqua-50 rounded-lg p-3 space-y-3">
      <p className="text-xs font-semibold text-aqua-800 uppercase tracking-wide">Add Email Action</p>
      <div>
        <label className="label text-xs">Email Template</label>
        <select className="input text-sm" value={templateType} onChange={(e) => setTemplateType(e.target.value)}>
          {TEMPLATE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="label text-xs">When to send</label>
          <select className="input text-sm" value={timingType} onChange={(e) => setTimingType(e.target.value as TimingType)}>
            <option value="immediately">Immediately after this event</option>
            <option value="days_before_visit">X days before the visit date</option>
            <option value="days_after_trigger">X days after this event</option>
          </select>
        </div>
        {timingType !== "immediately" && (
          <div className="w-20">
            <label className="label text-xs">Days</label>
            <input type="number" min={1} className="input text-sm" value={days} onChange={(e) => setDays(parseInt(e.target.value) || 1)} />
          </div>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
        <button onClick={handleAdd} className="btn-primary text-xs px-3 py-1.5"><Check className="h-3.5 w-3.5 mr-1" />Add</button>
      </div>
    </div>
  );
}

// ─── Journey branch column ─────────────────────────────────────────────────────

function JourneyBranch({ journey, onSave, onToggle, saving }: {
  journey: Journey | undefined;
  trigger: string;
  triggerLabel: string;
  branchLabel: string | null;
  onSave: (journey: Journey) => void;
  onToggle: (journey: Journey) => void;
  saving: boolean;
}) {
  const [addingStep, setAddingStep] = useState(false);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const steps = journey?.steps ?? [];

  const updateSteps = (newSteps: JourneyStep[]) => {
    if (!journey) return;
    onSave({ ...journey, steps: newSteps });
  };

  const handleAddStep = (step: JourneyStep) => {
    updateSteps([...steps, step]);
    setAddingStep(false);
  };

  const handleRemoveStep = (id: string) => {
    updateSteps(steps.filter((s) => s.id !== id));
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="space-y-2">
        {steps.map((step) => (
          editingStep === step.id ? (
            <AddStepForm
              key={step.id}
              onAdd={(updated) => {
                updateSteps(steps.map((s) => s.id === step.id ? { ...updated, id: step.id } : s));
                setEditingStep(null);
              }}
              onCancel={() => setEditingStep(null)}
            />
          ) : (
            <StepCard
              key={step.id}
              step={step}
              onRemove={() => handleRemoveStep(step.id)}
              onEdit={() => setEditingStep(step.id)}
            />
          )
        ))}

        {addingStep ? (
          <AddStepForm onAdd={handleAddStep} onCancel={() => setAddingStep(false)} />
        ) : (
          <button
            onClick={() => setAddingStep(true)}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg py-2.5 text-sm text-gray-400 hover:border-aqua-300 hover:text-aqua-600 transition-colors"
          >
            <Plus className="h-4 w-4" />Add email
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ section, journeys, onUpdate, saving }: {
  section: SectionDef;
  journeys: Journey[];
  onUpdate: (journey: Journey) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const sectionJourneys = section.triggers.map((t) => journeys.find((j) => j.trigger === t));
  const allEnabled = sectionJourneys.every((j) => j?.isEnabled !== false);
  const anyJourney = sectionJourneys.find(Boolean);

  const handleToggleSection = () => {
    for (const j of sectionJourneys) {
      if (j) onUpdate({ ...j, isEnabled: !allEnabled });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900">{section.title}</h3>
          <p className="text-xs text-gray-500">{section.description}</p>
        </div>
        <button
          onClick={handleToggleSection}
          disabled={!anyJourney || saving}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
            allEnabled ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {allEnabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
          {allEnabled ? "ON" : "OFF"}
        </button>
      </div>

      {/* Branch columns */}
      {expanded && (
        <div className={`p-4 ${section.triggers.length > 1 ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : ""}`}>
          {section.triggers.map((trigger) => {
            const journey = journeys.find((j) => j.trigger === trigger);
            const isBranched = section.triggers.length > 1;
            return (
              <div key={trigger}>
                {isBranched && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {TRIGGER_LABELS[trigger]}
                    </span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                )}
                {journey ? (
                  <JourneyBranch
                    journey={journey}
                    trigger={trigger}
                    triggerLabel={TRIGGER_LABELS[trigger] ?? trigger}
                    branchLabel={isBranched ? TRIGGER_LABELS[trigger] : null}
                    onSave={onUpdate}
                    onToggle={onUpdate}
                    saving={saving}
                  />
                ) : (
                  <div className="text-xs text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 rounded-lg">
                    No journey configured for this trigger
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AdminJourneys() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-journeys"],
    queryFn: () => api.get<{ journeys: Journey[] }>("/admin/journeys").then((r) => r.data.journeys),
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: (journey: Journey) =>
      api.put(`/admin/journeys/${journey.id}`, {
        name: journey.name,
        isEnabled: journey.isEnabled,
        steps: journey.steps,
      }),
    onMutate: async (updated) => {
      setSaving(true);
      await qc.cancelQueries({ queryKey: ["admin-journeys"] });
      const prev = qc.getQueryData<Journey[]>(["admin-journeys"]);
      qc.setQueryData<Journey[]>(["admin-journeys"], (old) => old?.map((j) => j.id === updated.id ? updated : j) ?? []);
      return { prev };
    },
    onError: (_err, _vars, ctx: any) => { if (ctx?.prev) qc.setQueryData(["admin-journeys"], ctx.prev); },
    onSettled: () => { setSaving(false); qc.invalidateQueries({ queryKey: ["admin-journeys"] }); },
  });

  const journeys = data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Communication Journey</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure which emails are sent automatically at each stage of a group's booking journey.
          {saving && <span className="ml-2 text-aqua-600 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-aqua-500" /></div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <SectionCard
              key={section.key}
              section={section}
              journeys={journeys}
              onUpdate={(j) => updateMutation.mutate(j)}
              saving={saving}
            />
          ))}

          <div className="card bg-blue-50 border-blue-200">
            <h3 className="font-medium text-blue-900 text-sm mb-1">How it works</h3>
            <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
              <li>Each event in the journey can trigger one or more emails to the group.</li>
              <li>Set timing to <strong>Immediately</strong> for instant sends, or schedule days before the visit or after the event.</li>
              <li>Toggle sections <strong>ON/OFF</strong> to pause all emails for that event without deleting them.</li>
              <li>Email templates are managed in <strong>Email Templates</strong>. Changes there affect all journeys that use that template.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
