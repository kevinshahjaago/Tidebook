import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { CheckCircle, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

// ── Group type editor ─────────────────────────────────────────────────────────

type GroupTypeOption = { value: string; label: string; description: string };

const AVAILABLE_GROUP_TYPES: { value: string; defaultLabel: string }[] = [
  { value: "SCHOOL",     defaultLabel: "School Group" },
  { value: "HOMESCHOOL", defaultLabel: "Home-School Family" },
  { value: "CORPORATE",  defaultLabel: "Corporate Group" },
  { value: "ADHOC",      defaultLabel: "Ad-Hoc Group" },
];

function GroupTypeOptionsEditor({
  initialJson,
  onSave,
  isSaving,
}: {
  initialJson: string;
  onSave: (json: string) => void;
  isSaving: boolean;
}) {
  const [options, setOptions] = useState<GroupTypeOption[]>(() => {
    try { return JSON.parse(initialJson); } catch { return []; }
  });

  useEffect(() => {
    try { setOptions(JSON.parse(initialJson)); } catch { /* keep current */ }
  }, [initialJson]);

  const save = (next: GroupTypeOption[]) => {
    setOptions(next);
    onSave(JSON.stringify(next));
  };

  const usedValues = new Set(options.map((o) => o.value));
  const available = AVAILABLE_GROUP_TYPES.filter((g) => !usedValues.has(g.value));

  const updateField = (idx: number, field: keyof GroupTypeOption, val: string) => {
    const next = options.map((o, i) => (i === idx ? { ...o, [field]: val } : o));
    save(next);
  };

  const remove = (idx: number) => save(options.filter((_, i) => i !== idx));

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...options];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    save(next);
  };

  const moveDown = (idx: number) => {
    if (idx === options.length - 1) return;
    const next = [...options];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    save(next);
  };

  const addType = (value: string) => {
    const def = AVAILABLE_GROUP_TYPES.find((g) => g.value === value);
    if (!def) return;
    save([...options, { value, label: def.defaultLabel, description: "" }]);
  };

  return (
    <div className="space-y-3">
      {options.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          No group types configured — guests won't be able to start a booking. Add at least one below.
        </p>
      )}

      {options.map((opt, idx) => (
        <div key={opt.value} className="border border-gray-200 rounded-lg p-4 bg-white">
          <div className="flex items-start gap-3">
            {/* Reorder */}
            <div className="flex flex-col gap-0.5 pt-1 shrink-0">
              <button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                title="Move up"
              >
                <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
              </button>
              <button
                onClick={() => moveDown(idx)}
                disabled={idx === options.length - 1}
                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                title="Move down"
              >
                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
              </button>
            </div>

            {/* Fields */}
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Button title</label>
                <input
                  className="input text-sm mt-1 w-full"
                  value={opt.label}
                  onChange={(e) => updateField(idx, "label", e.target.value)}
                  placeholder="e.g. School Group"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Description (optional)</label>
                <input
                  className="input text-sm mt-1 w-full"
                  value={opt.description}
                  onChange={(e) => updateField(idx, "description", e.target.value)}
                  placeholder="One line to help guests choose"
                />
              </div>
            </div>

            {/* Remove */}
            <button
              onClick={() => remove(idx)}
              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors shrink-0 mt-0.5"
              title="Remove this group type"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 ml-7">
            <span className="text-xs text-gray-400">Type: {opt.value}</span>
          </div>
        </div>
      ))}

      {/* Add button */}
      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            className="input text-sm w-64"
            defaultValue=""
            onChange={(e) => { if (e.target.value) { addType(e.target.value); e.target.value = ""; } }}
          >
            <option value="" disabled>Add a group type…</option>
            {available.map((g) => (
              <option key={g.value} value={g.value}>{g.defaultLabel}</option>
            ))}
          </select>
          <Plus className="h-4 w-4 text-gray-400" />
        </div>
      )}

      {isSaving && <p className="text-xs text-gray-400">Saving…</p>}
    </div>
  );
}

// ── Payment method editor ─────────────────────────────────────────────────────

type PaymentMethodOption = {
  value: string;
  label: string;
  description: string;
  emailInstructions: string;
  isVisible: boolean;
};

const PAYMENT_METHOD_DEFAULTS: PaymentMethodOption[] = [
  { value: "PAID",       label: "Pay by credit card or check",      description: "Payment is due on the day of your visit.",                    emailInstructions: "", isVisible: true },
  { value: "SCHOLARSHIP", label: "Apply for a scholarship",          description: "For Title I schools and qualifying organizations.",           emailInstructions: "", isVisible: true },
  { value: "INVOICE",    label: "Invoice / Purchase Order",          description: "For organizations that pay by purchase order or invoice.",   emailInstructions: "", isVisible: true },
];

function PaymentMethodOptionsEditor({
  initialJson,
  onSave,
  isSaving,
}: {
  initialJson: string;
  onSave: (json: string) => void;
  isSaving: boolean;
}) {
  const [options, setOptions] = useState<PaymentMethodOption[]>(() => {
    try {
      const parsed = JSON.parse(initialJson);
      // Back-fill any missing methods so all three are always shown
      return PAYMENT_METHOD_DEFAULTS.map((def) => {
        const existing = parsed.find((p: PaymentMethodOption) => p.value === def.value);
        return existing ?? def;
      });
    } catch { return PAYMENT_METHOD_DEFAULTS; }
  });

  useEffect(() => {
    try {
      const parsed = JSON.parse(initialJson);
      setOptions(PAYMENT_METHOD_DEFAULTS.map((def) => {
        const existing = parsed.find((p: PaymentMethodOption) => p.value === def.value);
        return existing ?? def;
      }));
    } catch { /* keep current */ }
  }, [initialJson]);

  const save = (next: PaymentMethodOption[]) => {
    setOptions(next);
    onSave(JSON.stringify(next));
  };

  const updateField = (idx: number, field: keyof PaymentMethodOption, val: string | boolean) => {
    save(options.map((o, i) => (i === idx ? { ...o, [field]: val } : o)));
  };

  const LABELS: Record<string, string> = { PAID: "Credit Card / Check", SCHOLARSHIP: "Scholarship", INVOICE: "Invoice / PO" };

  return (
    <div className="space-y-4">
      {options.map((opt, idx) => (
        <div key={opt.value} className={`border rounded-lg p-4 ${opt.isVisible ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200 opacity-60"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-gray-100 text-gray-600 rounded px-2 py-0.5">{LABELS[opt.value] ?? opt.value}</span>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-aqua-700"
                checked={opt.isVisible}
                onChange={(e) => updateField(idx, "isVisible", e.target.checked)}
              />
              Show to guests
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Button label</label>
              <input
                className="input text-sm mt-1 w-full"
                value={opt.label}
                onChange={(e) => updateField(idx, "label", e.target.value)}
                placeholder="e.g. Pay by check"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Description (shown below label)</label>
              <input
                className="input text-sm mt-1 w-full"
                value={opt.description}
                onChange={(e) => updateField(idx, "description", e.target.value)}
                placeholder="One line to help guests choose"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">
              Email instructions — included in the confirmation email when a guest chooses this option
            </label>
            <textarea
              rows={3}
              className="input text-sm mt-1 w-full"
              value={opt.emailInstructions}
              onChange={(e) => updateField(idx, "emailInstructions", e.target.value)}
              placeholder="Tell guests what to expect — due dates, how to pay, who to contact, etc."
            />
          </div>
        </div>
      ))}
      {isSaving && <p className="text-xs text-gray-400">Saving…</p>}
    </div>
  );
}

// ── Accessibility options editor ──────────────────────────────────────────────

function AccessibilityOptionsEditor({
  initialJson,
  onSave,
  isSaving,
}: {
  initialJson: string;
  onSave: (json: string) => void;
  isSaving: boolean;
}) {
  const [options, setOptions] = useState<string[]>(() => {
    try { return JSON.parse(initialJson); } catch { return []; }
  });
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    try { setOptions(JSON.parse(initialJson)); } catch { /* keep current */ }
  }, [initialJson]);

  const save = (next: string[]) => {
    setOptions(next);
    onSave(JSON.stringify(next));
  };

  const remove = (idx: number) => save(options.filter((_, i) => i !== idx));

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...options];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    save(next);
  };

  const moveDown = (idx: number) => {
    if (idx === options.length - 1) return;
    const next = [...options];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    save(next);
  };

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed || options.includes(trimmed)) return;
    save([...options, trimmed]);
    setNewItem("");
  };

  return (
    <div className="space-y-2">
      {options.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <div className="flex flex-col gap-0.5 shrink-0">
            <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30" title="Move up">
              <ChevronUp className="h-3 w-3 text-gray-500" />
            </button>
            <button onClick={() => moveDown(idx)} disabled={idx === options.length - 1} className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30" title="Move down">
              <ChevronDown className="h-3 w-3 text-gray-500" />
            </button>
          </div>
          <span className="flex-1 text-sm text-gray-800">{opt}</span>
          <button onClick={() => remove(idx)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-2">
        <input
          className="input text-sm flex-1"
          placeholder="Add an option (e.g. Sign language interpreter)"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
        />
        <button onClick={addItem} className="btn-secondary text-sm px-3 py-2 flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <p className="text-xs text-gray-500">Guests will see these as checkboxes, plus an "Other" free-text field.</p>
      {isSaving && <p className="text-xs text-gray-400">Saving…</p>}
    </div>
  );
}

// ── Standard settings ─────────────────────────────────────────────────────────

type SettingMeta = {
  label: string;
  hint: string;
  type: "number" | "text" | "url" | "textarea" | "time";
};

type SectionKey = string | "__group_type_options__" | "__payment_method_options__" | "__accessibility_options__" | "__booking_portal_toggle__";

type Section = {
  heading: string;
  description: string;
  keys: SectionKey[];
};

const SETTING_META: Record<string, SettingMeta> = {
  booking_form_subtitle: {
    label: "Booking form tagline",
    hint: "The line of text shown under 'Seattle Aquarium' at the very top of the guest booking form.",
    type: "text",
  },
  booking_connections_notice: {
    label: "Connections Partner reminder",
    hint: "A short note shown on the first booking step to direct Connections Partners to their own portal. A sign-in link is added automatically at the end.",
    type: "textarea",
  },
  booking_class_step_description: {
    label: "On-site program step — description",
    hint: "A sentence shown when guests are choosing whether to add an on-site program to their visit.",
    type: "textarea",
  },
  booking_coc_prefix: {
    label: "Code of Conduct checkbox — text before the link",
    hint: "The part of the agreement sentence that comes before the clickable Code of Conduct link.",
    type: "text",
  },
  booking_coc_link_label: {
    label: "Code of Conduct checkbox — link text",
    hint: "The words guests can click to open the Code of Conduct document.",
    type: "text",
  },
  booking_coc_suffix: {
    label: "Code of Conduct checkbox — text after the link",
    hint: "The part of the agreement sentence that comes after the link.",
    type: "text",
  },
  booking_slot_hold_banner: {
    label: "Slot hold countdown banner",
    hint: "The message shown when a guest's date and time are reserved while they complete the form. Use {time} for the arrival time, {date} for the formatted visit date, and {timer} for the mm:ss countdown.",
    type: "text",
  },
  booking_school_district_hint: {
    label: "School district field — hint text",
    hint: "The helper text shown below the School District field on the booking form.",
    type: "text",
  },
  arrival_slot_start: {
    label: "First arrival time of the day",
    hint: "Earliest time a group can arrive. Use 24-hour format — for example, 09:00 for 9 AM.",
    type: "time",
  },
  arrival_slot_end: {
    label: "Last arrival time of the day",
    hint: "Latest time a group can arrive. Use 24-hour format — for example, 14:00 for 2 PM.",
    type: "time",
  },
  arrival_slot_interval_minutes: {
    label: "Minutes between arrival slots",
    hint: "How much spacing between each available arrival time. For example, 30 gives slots at 9:00, 9:30, 10:00, and so on.",
    type: "number",
  },
  limited_availability_threshold: {
    label: "When to show 'Limited availability' on the calendar",
    hint: "The booking calendar shows a warning badge when fewer than this many spots remain for a given day.",
    type: "number",
  },
  chaperone_ratio_lower_grades: {
    label: "Chaperone ratio for Pre-K through 8th grade — 1 adult for every ___ students",
    hint: "Applied when any student in the group is in Pre-K through 8th grade. Groups that don't meet this ratio will be asked to bring more adults.",
    type: "number",
  },
  chaperone_ratio_upper_grades: {
    label: "Chaperone ratio for 9th through 12th grade — 1 adult for every ___ students",
    hint: "Applied when all students are in 9th–12th grade. Groups that don't meet this ratio will be asked to bring more adults.",
    type: "number",
  },
  chaperone_ratio_default: {
    label: "Chaperone ratio for non-school groups — 1 adult for every ___ students",
    hint: "Used for Corporate and Ad-Hoc groups. Groups that don't meet this ratio will be asked to bring more adults.",
    type: "number",
  },
  large_group_threshold: {
    label: "Large group threshold — groups over ___ students may add a second program",
    hint: "Groups larger than this may select two on-site programs during booking instead of one.",
    type: "number",
  },
  cancellation_cutoff_days: {
    label: "Online cancellation closes ___ days before the visit",
    hint: "After this window closes, teachers must contact you directly to cancel.",
    type: "number",
  },
  reschedule_cutoff_days: {
    label: "Reschedule link expires ___ days before the visit",
    hint: "The unique reschedule link emailed to teachers stops working this many days before their visit.",
    type: "number",
  },
  scholarship_budget_total: {
    label: "Total scholarship budget for this season ($)",
    hint: "Used to track remaining funds on the Scholarships page. Does not automatically block new applications when reached.",
    type: "number",
  },
  code_of_conduct_url: {
    label: "Code of Conduct document link",
    hint: "The PDF or page guests open when they click the Code of Conduct link on the booking form and in emails.",
    type: "url",
  },
  post_visit_survey_url: {
    label: "Post-visit survey link",
    hint: "Link to the feedback survey included in the follow-up email sent after each visit.",
    type: "url",
  },
  docusign_bus_reimbursement_url: {
    label: "Bus reimbursement form link",
    hint: "DocuSign link for the bus reimbursement document sent to groups whose scholarship is approved.",
    type: "url",
  },
  class_break_minutes: {
    label: "Required break between sessions of the same program — ___ minutes",
    hint: "After a program session ends, this many minutes must pass before the same program can start again. Prevents back-to-back sessions that staff can't prepare for.",
    type: "number",
  },
  class_arrival_buffer_minutes: {
    label: "Class start must be at least ___ minutes after the group's arrival",
    hint: "Ensures groups have time to check in and get settled before their program begins. The system will only offer class times that respect this gap.",
    type: "number",
  },
  slot_hold_minutes: {
    label: "Slot reservation hold — ___ minutes",
    hint: "When a guest selects a date and arrival time, the system holds their slot for this many minutes while they complete the booking form. After this window, the slot is released and they must start over.",
    type: "number",
  },
  booking_portal_closed_message: {
    label: "Portal closed message",
    hint: "The message guests see when the booking portal is disabled. Should explain when registration will reopen or how to reach you directly.",
    type: "textarea",
  },
  data_retention_years: {
    label: "Keep completed booking records for ___ years",
    hint: "Completed visits older than this become eligible for archiving. Supports FERPA obligations.",
    type: "number",
  },
  booking_special_requests_label: {
    label: "Special requests field — label shown to guests",
    hint: "The label guests see above the free-text field for notes like parking, lunch space, etc. Leave blank to hide the field.",
    type: "text",
  },
};

const SECTIONS: Section[] = [
  {
    heading: "Booking Portal Status",
    description: "Quickly open or close the public booking portal. Use this when you're not ready to accept reservations, during seasonal transitions, or for maintenance.",
    keys: ["__booking_portal_toggle__", "booking_portal_closed_message"],
  },
  {
    heading: "What Groups See When They Book",
    description: "Every piece of text on the public booking form. Changes go live immediately.",
    keys: [
      "booking_form_subtitle",
      "booking_connections_notice",
      "__group_type_options__",
      "booking_class_step_description",
      "booking_coc_prefix", "booking_coc_link_label", "booking_coc_suffix",
      "booking_slot_hold_banner",
      "booking_school_district_hint",
    ],
  },
  {
    heading: "Payment & Invoicing",
    description: "Control which billing options guests see on the booking form and what payment instructions they receive in their confirmation email.",
    keys: ["__payment_method_options__"],
  },
  {
    heading: "On-Site Program Scheduling",
    description: "Rules that control when classes can be booked and how the system prevents conflicts.",
    keys: ["class_break_minutes", "class_arrival_buffer_minutes", "slot_hold_minutes"],
  },
  {
    heading: "Accessibility & Special Requests",
    description: "Customize the accessibility checklist guests see when booking, and configure the special requests field.",
    keys: ["__accessibility_options__", "booking_special_requests_label"],
  },
  {
    heading: "Arrival Times & Scheduling",
    description: "Control when groups can arrive and how the availability calendar behaves.",
    keys: ["arrival_slot_start", "arrival_slot_end", "arrival_slot_interval_minutes", "limited_availability_threshold"],
  },
  {
    heading: "Group Policies",
    description: "Rules that apply to all group visits.",
    keys: ["chaperone_ratio_lower_grades", "chaperone_ratio_upper_grades", "chaperone_ratio_default", "large_group_threshold"],
  },
  {
    heading: "Cancellations & Changes",
    description: "Set how long teachers can self-serve cancel or reschedule online.",
    keys: ["cancellation_cutoff_days", "reschedule_cutoff_days"],
  },
  {
    heading: "Scholarship Program",
    description: "Track your scholarship budget for the season.",
    keys: ["scholarship_budget_total"],
  },
  {
    heading: "Links & Documents",
    description: "External links included in the booking form and outgoing emails.",
    keys: ["code_of_conduct_url", "post_visit_survey_url", "docusign_bus_reimbursement_url"],
  },
  {
    heading: "Records & Data",
    description: "How long completed booking data is kept on file.",
    keys: ["data_retention_years"],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () =>
      api.get<{ settings: { key: string; value: string }[] }>("/admin/settings").then((r) => r.data.settings),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/admin/settings/${key}`, { value }),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    },
  });

  const settingsMap = new Map(data?.map((s) => [s.key, s.value]) ?? []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Portal Settings</h1>
      <p className="text-gray-500 text-sm mb-10">
        Everything here takes effect immediately — no restart or code change needed. Click out of a field to save it.
      </p>

      <div className="space-y-12">
        {SECTIONS.map((section) => (
          <div key={section.heading}>
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">{section.heading}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{section.description}</p>
            </div>
            <div className="space-y-3">
              {section.keys.map((key) => {
                // Special: payment method editor
                if (key === "__payment_method_options__") {
                  return (
                    <div key="payment_method_options" className="card">
                      <div className="mb-3">
                        <p className="font-medium text-sm text-gray-900">Payment options shown on the booking form</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Configure the billing options guests see during booking and the payment instructions they receive in their confirmation email.
                          Hide any option that doesn't apply to your program.
                        </p>
                      </div>
                      <PaymentMethodOptionsEditor
                        initialJson={settingsMap.get("payment_method_options") ?? "[]"}
                        onSave={(json) => updateMutation.mutate({ key: "payment_method_options", value: json })}
                        isSaving={updateMutation.isPending}
                      />
                    </div>
                  );
                }

                // Special: accessibility options editor
                if (key === "__accessibility_options__") {
                  return (
                    <div key="accessibility_options" className="card">
                      <div className="mb-3">
                        <p className="font-medium text-sm text-gray-900">Accessibility checklist options</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          These appear as checkboxes on the booking form. Guests can select all that apply, and there's always an "Other" free-text field at the end.
                        </p>
                      </div>
                      <AccessibilityOptionsEditor
                        initialJson={settingsMap.get("accessibility_options") ?? "[]"}
                        onSave={(json) => updateMutation.mutate({ key: "accessibility_options", value: json })}
                        isSaving={updateMutation.isPending}
                      />
                    </div>
                  );
                }

                // Special: booking portal toggle
                if (key === "__booking_portal_toggle__") {
                  const enabled = settingsMap.get("booking_portal_enabled") !== "false";
                  return (
                    <div key="booking_portal_toggle" className="card">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm text-gray-900">Accept new bookings</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            When off, the public booking form shows your closed message and guests cannot submit new registrations.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateMutation.mutate({ key: "booking_portal_enabled", value: enabled ? "false" : "true" })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            enabled ? "bg-aqua-700" : "bg-gray-300"
                          }`}
                          aria-checked={enabled}
                          role="switch"
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              enabled ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                      <div className={`mt-3 text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5 ${enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-green-500" : "bg-red-500"}`} />
                        {enabled ? "Portal is open — guests can book" : "Portal is closed — guests see your message"}
                      </div>
                    </div>
                  );
                }

                // Special: group type list editor
                if (key === "__group_type_options__") {
                  return (
                    <div key="group_type_options" className="card">
                      <div className="mb-3">
                        <p className="font-medium text-sm text-gray-900">Group types shown on the booking form</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Add, remove, rename, or reorder the group type choices guests see on the first step.
                          Each type needs a title; the description is optional but helps guests choose the right option.
                        </p>
                      </div>
                      <GroupTypeOptionsEditor
                        initialJson={settingsMap.get("group_type_options") ?? "[]"}
                        onSave={(json) => updateMutation.mutate({ key: "group_type_options", value: json })}
                        isSaving={updateMutation.isPending}
                      />
                    </div>
                  );
                }

                const meta = SETTING_META[key];
                if (!meta) return null;
                const value = settingsMap.get(key) ?? "";
                const isSaved = saved === key;

                return (
                  <div key={key} className="card">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <label className="font-medium text-sm text-gray-900">{meta.label}</label>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{meta.hint}</p>
                        {meta.type === "textarea" ? (
                          <textarea
                            rows={3}
                            className="input text-sm mt-2 w-full"
                            defaultValue={value}
                            onBlur={(e) => {
                              if (e.target.value !== value) updateMutation.mutate({ key, value: e.target.value });
                            }}
                          />
                        ) : (
                          <input
                            type={meta.type === "number" ? "number" : meta.type === "url" ? "url" : meta.type === "time" ? "time" : "text"}
                            min={meta.type === "number" ? 0 : undefined}
                            className="input text-sm mt-2 w-full max-w-md"
                            defaultValue={value}
                            onBlur={(e) => {
                              if (e.target.value !== value) updateMutation.mutate({ key, value: e.target.value });
                            }}
                          />
                        )}
                      </div>
                      <div className="w-16 flex justify-end pt-6 shrink-0">
                        {isSaved && (
                          <div className="flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle className="h-4 w-4" />
                            Saved
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
