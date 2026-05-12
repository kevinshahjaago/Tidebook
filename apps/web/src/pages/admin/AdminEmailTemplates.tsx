import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { CheckCircle, ChevronDown, ChevronUp, Mail, ToggleLeft, ToggleRight } from "lucide-react";

interface EmailTemplate {
  triggerType: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isEnabled: boolean;
  updatedAt: string;
}

const TRIGGER_LABELS: Record<string, { label: string; description: string }> = {
  BOOKING_CONFIRMED_STANDARD:     { label: "Booking confirmed (auto)",         description: "Sent immediately when a paid/invoice group's booking is auto-confirmed." },
  BOOKING_CONFIRMED_BY_REGISTRAR: { label: "Booking confirmed (by staff)",     description: "Sent when a registrar manually confirms a pending booking." },
  BOOKING_PENDING_REVIEW:         { label: "Booking awaiting review",          description: "Sent to the group when their booking requires staff review (scholarship, accessibility)." },
  BOOKING_DECLINED:               { label: "Booking declined",                 description: "Sent when a registrar declines a booking request." },
  RESCHEDULE_COMPLETED:           { label: "Reschedule confirmed",             description: "Sent after a group successfully reschedules via their self-serve link." },
  RESCHEDULE_PENDING_REVIEW:      { label: "Reschedule awaiting review",       description: "Sent after a reschedule goes to PENDING (scholarship group)." },
  REMINDER_14_DAYS:               { label: "14-day visit reminder",            description: "Sent automatically 14 days before the visit date." },
  POST_VISIT_SURVEY:              { label: "Post-visit survey",                description: "Sent 2 days after the visit date (or when marked completed)." },
  SCHOLARSHIP_APPROVED:           { label: "Scholarship approved",             description: "Sent when a scholarship application is approved." },
  SCHOLARSHIP_INCOMPLETE_10_DAYS: { label: "Scholarship incomplete (10 days)", description: "Sent when a scholarship application has been pending for 10 days without documents." },
  SCHOLARSHIP_INCOMPLETE_FOLLOWUP:{ label: "Scholarship incomplete (follow-up)",description: "Second follow-up for incomplete scholarship applications." },
  BUS_REIMBURSEMENT_INFO:         { label: "Bus reimbursement info",           description: "Sent to groups who qualify for bus reimbursement." },
};

const VARIABLE_REFERENCE = [
  "{{contactName}}", "{{organizationName}}", "{{visitDate}}", "{{arrivalTimeSlot}}",
  "{{studentCount}}", "{{adultCount}}", "{{bookingId}}", "{{rescheduleLink}}",
  "{{className}}", "{{declinedReason}}", "{{surveyLink}}", "{{cocLink}}",
  "{{paymentInstructions}}", "{{reimbursementLink}}",
];

function TemplateEditor({
  template,
  onClose,
}: {
  template: EmailTemplate;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const [bodyText, setBodyText] = useState(template.bodyText);
  const [isEnabled, setIsEnabled] = useState(template.isEnabled);
  const [showVars, setShowVars] = useState(false);
  const [tab, setTab] = useState<"html" | "text">("html");

  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/admin/email-templates/${template.triggerType}`, { subject, bodyHtml, bodyText, isEnabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-email-templates"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const info = TRIGGER_LABELS[template.triggerType];

  return (
    <div className="card border-2 border-aqua-200">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{info?.label ?? template.triggerType}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{info?.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setIsEnabled(!isEnabled); }}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${isEnabled ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}
          >
            {isEnabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
            {isEnabled ? "Enabled" : "Disabled"}
          </button>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>

      <div className="mb-3">
        <label className="label text-xs">Subject line</label>
        <input
          className="input text-sm w-full mt-1"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject…"
        />
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex gap-1">
            {(["html", "text"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 text-xs rounded-t-lg border-b-2 transition-colors ${tab === t ? "border-aqua-700 text-aqua-700 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                {t === "html" ? "HTML body" : "Plain text body"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowVars(!showVars)}
            className="text-xs text-aqua-700 flex items-center gap-1"
          >
            Variables {showVars ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {showVars && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 flex flex-wrap gap-1.5">
            {VARIABLE_REFERENCE.map((v) => (
              <code
                key={v}
                className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-aqua-800 cursor-pointer hover:bg-aqua-50"
                onClick={() => navigator.clipboard.writeText(v).catch(() => {})}
                title="Click to copy"
              >
                {v}
              </code>
            ))}
            <p className="text-xs text-gray-400 w-full mt-1">Click any variable to copy it.</p>
          </div>
        )}

        {tab === "html" ? (
          <textarea
            className="input text-xs font-mono w-full"
            rows={12}
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
          />
        ) : (
          <textarea
            className="input text-xs font-mono w-full"
            rows={12}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn-primary text-sm px-5 py-2"
        >
          {mutation.isPending ? "Saving…" : "Save template"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-green-600 text-xs">
            <CheckCircle className="h-4 w-4" /> Saved
          </span>
        )}
        {mutation.isError && <span className="text-red-600 text-xs">Save failed</span>}
      </div>
    </div>
  );
}

export default function AdminEmailTemplates() {
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: () =>
      api.get<{ templates: EmailTemplate[] }>("/admin/email-templates").then((r) => r.data.templates),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-aqua-700 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Email Templates</h1>
        <p className="text-sm text-gray-500 mt-1">
          Customize every automated email. Use <code className="text-xs bg-gray-100 px-1 rounded">{"{{variables}}"}</code> to insert booking data. Changes take effect immediately.
        </p>
      </div>

      {!data || data.length === 0 ? (
        <div className="card text-center py-10">
          <Mail className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No email templates found. Run the database seed to create them.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((template) => {
            const info = TRIGGER_LABELS[template.triggerType];
            const isExpanded = expandedType === template.triggerType;

            if (isExpanded) {
              return (
                <TemplateEditor
                  key={template.triggerType}
                  template={template}
                  onClose={() => setExpandedType(null)}
                />
              );
            }

            return (
              <div key={template.triggerType} className="card hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className={`h-4 w-4 ${template.isEnabled ? "text-aqua-600" : "text-gray-300"}`} />
                    <div>
                      <p className="font-medium text-sm text-gray-900">{info?.label ?? template.triggerType}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{info?.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${template.isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {template.isEnabled ? "On" : "Off"}
                    </span>
                    <button
                      onClick={() => setExpandedType(template.triggerType)}
                      className="text-sm text-aqua-700 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2 font-mono truncate">Subject: {template.subject}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
