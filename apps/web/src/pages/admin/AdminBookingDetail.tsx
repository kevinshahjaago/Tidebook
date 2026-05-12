import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { Booking, BookingStatus } from "@tidebook/shared";
import {
  CheckCircle, XCircle, RefreshCw, AlertCircle, ChevronLeft,
  Mail, CheckSquare, Bus, Send, Loader2,
} from "lucide-react";
import { AxiosError } from "axios";

const RESENDABLE_TRIGGERS = [
  { value: "BOOKING_CONFIRMED_STANDARD",      label: "Confirmation (standard)" },
  { value: "BOOKING_CONFIRMED_BY_REGISTRAR",  label: "Confirmation (reviewed by staff)" },
  { value: "BOOKING_PENDING_REVIEW",          label: "Awaiting review" },
  { value: "REMINDER_14_DAYS",               label: "14-day reminder" },
  { value: "POST_VISIT_SURVEY",              label: "Post-visit survey" },
  { value: "SCHOLARSHIP_APPROVED",           label: "Scholarship approved" },
  { value: "BUS_REIMBURSEMENT_INFO",         label: "Bus reimbursement info" },
];

export default function AdminBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [notesEditing, setNotesEditing] = useState(false);
  const [resendTrigger, setResendTrigger] = useState("BOOKING_CONFIRMED_BY_REGISTRAR");
  const [showResendPanel, setShowResendPanel] = useState(false);
  const [busStatus, setBusStatus] = useState("");
  const [busAmount, setBusAmount] = useState("");
  const [busCount, setBusCount] = useState("1");
  const [showBusPanel, setShowBusPanel] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-booking", id],
    queryFn: () =>
      api.get<Booking & { internalNotes: string; emailLogs: any[]; busReimbursement: any }>(`/admin/bookings/${id}`)
        .then((r) => r.data),
    enabled: !!id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-booking", id] });

  const confirmMutation = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${id}/confirm`),
    onSuccess: invalidate,
  });

  const completeMutation = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${id}/complete`),
    onSuccess: invalidate,
  });

  const declineMutation = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${id}/decline`, { reason: declineReason }),
    onSuccess: () => { invalidate(); setShowDeclineForm(false); },
  });

  const notesMutation = useMutation({
    mutationFn: () => api.patch(`/admin/bookings/${id}/notes`, { internalNotes }),
    onSuccess: () => { invalidate(); setNotesEditing(false); },
  });

  const acmeMutation = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${id}/acme-retry`),
    onSuccess: invalidate,
  });

  const disableRescheduleMutation = useMutation({
    mutationFn: () => api.patch(`/admin/bookings/${id}/disable-reschedule`),
    onSuccess: invalidate,
  });

  const resendMutation = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${id}/resend-email`, { triggerType: resendTrigger }),
    onSuccess: () => { invalidate(); setShowResendPanel(false); },
  });

  const busMutation = useMutation({
    mutationFn: () => api.patch(`/admin/bookings/${id}/bus-reimbursement`, {
      status: busStatus,
      ...(busAmount ? { amountApproved: parseFloat(busAmount) } : {}),
      busCount: parseInt(busCount) || 1,
    }),
    onSuccess: () => { invalidate(); setShowBusPanel(false); },
  });

  const booking = data;

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-aqua-700 border-t-transparent rounded-full" /></div>;
  }
  if (!booking) {
    return <div className="card text-center py-8 text-gray-500">Booking not found</div>;
  }

  // Parse grade student counts for display
  let gradeBreakdown: Record<string, number> | null = null;
  try {
    if ((booking as any).gradeStudentCounts) {
      gradeBreakdown = JSON.parse((booking as any).gradeStudentCounts);
    }
  } catch { /* ignore */ }

  const busReimbursement = (booking as any).busReimbursement;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ChevronLeft className="h-4 w-4" />
        Back to bookings
      </button>

      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 break-words">{booking.organizationName}</h1>
          <p className="text-gray-500 text-sm mt-1 font-mono truncate">{booking.id}</p>
        </div>
        <div className="flex-shrink-0"><StatusBadge status={booking.status} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h2 className="font-semibold mb-4">Visit Details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-500">Visit Date</dt>
              <dd className="font-medium">{booking.visitDate}</dd>
              <dt className="text-gray-500">Arrival Time</dt>
              <dd>{booking.arrivalTimeSlot}</dd>
              <dt className="text-gray-500">Group Type</dt>
              <dd>{booking.groupType}</dd>
              <dt className="text-gray-500">Students</dt>
              <dd>{booking.studentCount}</dd>
              <dt className="text-gray-500">Adults / Chaperones</dt>
              <dd>{booking.adultCount}</dd>
              <dt className="text-gray-500">Grade Levels</dt>
              <dd>{booking.gradeLevels?.join(", ") || "—"}</dd>
              <dt className="text-gray-500">Payment</dt>
              <dd>{booking.paymentMethod}</dd>
              <dt className="text-gray-500">ACME Order</dt>
              <dd>{booking.acmeOrderNumber ?? <span className="text-gray-400">Not pushed</span>}</dd>
              {booking.accessibilityNeeds && booking.accessibilityNeeds !== "None" && (
                <>
                  <dt className="text-gray-500">Accessibility</dt>
                  <dd className="text-amber-700 bg-amber-50 rounded px-2 py-0.5">{booking.accessibilityNeeds}</dd>
                </>
              )}
              {(booking as any).groupNotes && (
                <>
                  <dt className="text-gray-500">Group Notes</dt>
                  <dd>{(booking as any).groupNotes}</dd>
                </>
              )}
              {(booking as any).transportationReimbursementRequested && (
                <>
                  <dt className="text-gray-500">Transportation Reimbursement</dt>
                  <dd className="text-blue-700 font-medium">Requested</dd>
                </>
              )}
            </dl>
          </div>

          {/* Per-grade breakdown */}
          {gradeBreakdown && Object.keys(gradeBreakdown).length > 0 && (
            <div className="card">
              <h2 className="font-semibold mb-3">Students by Grade</h2>
              <div className="space-y-1">
                {Object.entries(gradeBreakdown).map(([grade, count]) => (
                  <div key={grade} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-700">{grade}</span>
                    <span className="font-medium">{count} student{count !== 1 ? "s" : ""}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-200 mt-1">
                  <span>Total</span>
                  <span>{Object.values(gradeBreakdown).reduce((s, n) => s + n, 0)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold mb-4">Contact Information</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {booking.schoolDistrict && (
                <>
                  <dt className="text-gray-500">School District</dt>
                  <dd>{booking.schoolDistrict}</dd>
                </>
              )}
              {booking.addressStreet1 && (
                <>
                  <dt className="text-gray-500">Address</dt>
                  <dd>
                    {booking.addressStreet1}{booking.addressStreet2 ? `, ${booking.addressStreet2}` : ""}<br />
                    {[booking.addressCity, booking.addressState].filter(Boolean).join(", ")}{booking.addressZip ? ` ${booking.addressZip}` : ""}
                  </dd>
                </>
              )}
              <dt className="text-gray-500">Contact Name</dt>
              <dd>{booking.contactName}</dd>
              <dt className="text-gray-500">Email</dt>
              <dd><a href={`mailto:${booking.contactEmail}`} className="text-aqua-700">{booking.contactEmail}</a></dd>
              <dt className="text-gray-500">Direct Phone</dt>
              <dd>{booking.contactPhone}</dd>
              {booking.dayOfContactName && (
                <>
                  <dt className="text-gray-500">Day-of-Visit Contact</dt>
                  <dd>{booking.dayOfContactName}</dd>
                </>
              )}
              {booking.dayOfContactPhone && (
                <>
                  <dt className="text-gray-500">Day-of-Visit Phone</dt>
                  <dd>{booking.dayOfContactPhone}</dd>
                </>
              )}
              {(booking as any).dayOfContactRole && (
                <>
                  <dt className="text-gray-500">Day-of-Visit Role</dt>
                  <dd>{(booking as any).dayOfContactRole}</dd>
                </>
              )}
              {(booking as any).dayOfContactEmail && (
                <>
                  <dt className="text-gray-500">Day-of-Visit Email</dt>
                  <dd><a href={`mailto:${(booking as any).dayOfContactEmail}`} className="text-aqua-700">{(booking as any).dayOfContactEmail}</a></dd>
                </>
              )}
            </dl>
          </div>

          {/* Accessibility & Multilingual Support */}
          {(booking as any).accessibilityData && (() => {
            try {
              const data = JSON.parse((booking as any).accessibilityData);
              const hasData = (data.accommodations?.length > 0) || (data.multilingual?.length > 0);
              if (!hasData) return null;
              return (
                <div className="card">
                  <h2 className="font-semibold mb-3">Accessibility & Multilingual Support</h2>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                    {data.accommodations?.length > 0 && (
                      <>
                        <dt className="text-gray-500">Accommodations</dt>
                        <dd className="text-amber-700">{data.accommodations.join(", ")}</dd>
                      </>
                    )}
                    {data.accommodationsOther && (
                      <>
                        <dt className="text-gray-500">Accommodations (other)</dt>
                        <dd>{data.accommodationsOther}</dd>
                      </>
                    )}
                    {data.multilingual?.length > 0 && (
                      <>
                        <dt className="text-gray-500">Multilingual support</dt>
                        <dd>{data.multilingual.join(", ")}</dd>
                      </>
                    )}
                    {data.multilingualOther && (
                      <>
                        <dt className="text-gray-500">Multilingual (other)</dt>
                        <dd>{data.multilingualOther}</dd>
                      </>
                    )}
                    {data.languages && Object.entries(data.languages).length > 0 && (
                      <>
                        <dt className="text-gray-500">Languages</dt>
                        <dd>{Object.entries(data.languages).map(([item, lang]) => `${item}: ${lang as string}`).join("; ")}</dd>
                      </>
                    )}
                  </dl>
                </div>
              );
            } catch { return null; }
          })()}

          {/* Scholarship */}
          {booking.scholarshipApplication && (
            <div className="card">
              <h2 className="font-semibold mb-3">Scholarship Application</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-gray-500">Status</dt>
                <dd className="font-medium">{booking.scholarshipApplication.status}</dd>
                <dt className="text-gray-500">Title I</dt>
                <dd>{booking.scholarshipApplication.titleOneStatus ? "Yes" : "No"}</dd>
                <dt className="text-gray-500">School Enrollment</dt>
                <dd>{booking.scholarshipApplication.enrollmentCount}</dd>
                {booking.scholarshipApplication.scholarshipQualifications?.length > 0 && (
                  <>
                    <dt className="text-gray-500">Qualifications</dt>
                    <dd>{booking.scholarshipApplication.scholarshipQualifications.join(", ")}</dd>
                  </>
                )}
                {booking.scholarshipApplication.budgetAllocated && (
                  <>
                    <dt className="text-gray-500">Budget allocated</dt>
                    <dd>${booking.scholarshipApplication.budgetAllocated}</dd>
                  </>
                )}
                {booking.scholarshipApplication.reviewNotes && (
                  <>
                    <dt className="text-gray-500">Review notes</dt>
                    <dd className="italic text-gray-600">"{booking.scholarshipApplication.reviewNotes}"</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {/* Bus reimbursement */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Bus className="h-4 w-4 text-gray-500" />
                Bus Reimbursement
              </h2>
              <button
                onClick={() => {
                  setBusStatus(busReimbursement?.status ?? "NOT_SUBMITTED");
                  setBusAmount(busReimbursement?.amountApproved?.toString() ?? "");
                  setBusCount(busReimbursement?.busCount?.toString() ?? "1");
                  setShowBusPanel(true);
                }}
                className="text-sm text-aqua-700 hover:underline"
              >
                {busReimbursement ? "Update" : "Track"}
              </button>
            </div>
            {busReimbursement ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-gray-500">Status</dt>
                <dd className={`font-medium ${busReimbursement.status === "PROCESSED" ? "text-green-700" : busReimbursement.status === "SUBMITTED" ? "text-blue-700" : "text-gray-500"}`}>
                  {busReimbursement.status.replace("_", " ")}
                </dd>
                <dt className="text-gray-500">Buses</dt>
                <dd>{busReimbursement.busCount}</dd>
                {busReimbursement.amountApproved && (
                  <>
                    <dt className="text-gray-500">Amount approved</dt>
                    <dd>${busReimbursement.amountApproved}</dd>
                  </>
                )}
                {busReimbursement.submittedAt && (
                  <>
                    <dt className="text-gray-500">Submitted</dt>
                    <dd>{new Date(busReimbursement.submittedAt).toLocaleDateString()}</dd>
                  </>
                )}
                {busReimbursement.processedAt && (
                  <>
                    <dt className="text-gray-500">Processed</dt>
                    <dd>{new Date(busReimbursement.processedAt).toLocaleDateString()}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">No reimbursement tracked yet</p>
            )}

            {showBusPanel && (
              <div className="mt-4 bg-gray-50 rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Status</label>
                    <select className="input text-sm" value={busStatus} onChange={(e) => setBusStatus(e.target.value)}>
                      <option value="NOT_SUBMITTED">Not submitted</option>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="PROCESSED">Processed</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Number of buses</label>
                    <input type="number" min="1" className="input text-sm" value={busCount} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setBusCount(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Amount approved ($)</label>
                  <input type="number" step="0.01" className="input text-sm max-w-xs" value={busAmount} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setBusAmount(e.target.value)} placeholder="e.g. 500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => busMutation.mutate()} disabled={!busStatus || busMutation.isPending} className="btn-primary text-sm px-4 py-2">
                    {busMutation.isPending ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setShowBusPanel(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
                </div>
                {busMutation.isError && <p className="text-sm text-red-600">Failed to save</p>}
              </div>
            )}
          </div>

          {/* Internal notes */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Internal Notes</h2>
              {!notesEditing && (
                <button onClick={() => { setInternalNotes((booking as any).internalNotes ?? ""); setNotesEditing(true); }} className="text-sm text-aqua-700 hover:underline">
                  Edit
                </button>
              )}
            </div>
            {notesEditing ? (
              <div>
                <textarea rows={4} className="input w-full text-sm" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => notesMutation.mutate()} className="btn-primary text-sm px-4 py-2" disabled={notesMutation.isPending}>Save</button>
                  <button onClick={() => setNotesEditing(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {(booking as any).internalNotes || <span className="text-gray-400">No internal notes</span>}
              </p>
            )}
          </div>

          {/* Email log */}
          {(booking as any).emailLogs?.length > 0 && (
            <div className="card">
              <h2 className="font-semibold mb-3">Email Log</h2>
              <div className="space-y-2">
                {(booking as any).emailLogs.map((log: any) => (
                  <div key={log.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm py-1.5 border-b border-gray-100 last:border-0">
                    <div className="min-w-0">
                      <span className="font-medium">{log.triggerType.replace(/_/g, " ")}</span>
                      <span className="text-gray-500 ml-2 text-xs truncate hidden sm:inline">{log.toAddress}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs ${log.status === "SENT" ? "text-green-600" : "text-red-600"}`}>{log.status}</span>
                      <span className="text-xs text-gray-400">{new Date(log.sentAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions sidebar */}
        <div className="space-y-4">
          {/* Pending actions */}
          {booking.status === BookingStatus.PENDING && (
            <div className="card">
              <h2 className="font-semibold mb-3">Review</h2>
              <div className="space-y-2">
                <button
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  {confirmMutation.isPending ? "Confirming…" : "Confirm Booking"}
                </button>
                {confirmMutation.isError && <p className="text-xs text-red-600 text-center">{(confirmMutation.error as AxiosError<any>)?.response?.data?.error?.message ?? "Failed"}</p>}

                {!showDeclineForm ? (
                  <button onClick={() => setShowDeclineForm(true)} className="btn-secondary w-full flex items-center justify-center gap-2 text-red-700 border-red-300">
                    <XCircle className="h-4 w-4" />
                    Decline
                  </button>
                ) : (
                  <div>
                    <textarea rows={3} className="input w-full text-sm" placeholder="Reason for declining…" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => declineMutation.mutate()} disabled={!declineReason.trim() || declineMutation.isPending} className="flex-1 btn-primary bg-red-600 hover:bg-red-700 focus:ring-red-500 text-sm py-2">
                        Confirm Decline
                      </button>
                      <button onClick={() => setShowDeclineForm(false)} className="btn-secondary text-sm py-2 px-3">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mark completed */}
          {booking.status === BookingStatus.CONFIRMED && (
            <div className="card">
              <h2 className="font-semibold mb-3">Post-Visit</h2>
              <button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <CheckSquare className="h-4 w-4" />
                {completeMutation.isPending ? "Saving…" : "Mark Visit Completed"}
              </button>
              <p className="text-xs text-gray-500 mt-2">Sends a post-visit survey email automatically.</p>
              {completeMutation.isError && <p className="text-xs text-red-600 mt-1">Failed to update</p>}
            </div>
          )}

          {/* Resend email */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500" />
                Emails
              </h2>
              <button onClick={() => setShowResendPanel((v) => !v)} className="text-sm text-aqua-700 hover:underline">
                {showResendPanel ? "Cancel" : "Resend"}
              </button>
            </div>
            {showResendPanel && (
              <div className="space-y-2">
                <select className="input text-sm w-full" value={resendTrigger} onChange={(e) => setResendTrigger(e.target.value)}>
                  {RESENDABLE_TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {resendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {resendMutation.isPending ? "Sending…" : "Send Email"}
                </button>
                {resendMutation.isSuccess && <p className="text-xs text-green-600 text-center">Email sent</p>}
                {resendMutation.isError && <p className="text-xs text-red-600 text-center">Send failed</p>}
              </div>
            )}
          </div>

          {/* ACME */}
          <div className="card">
            <h2 className="font-semibold mb-3">Integrations</h2>
            <button
              onClick={() => acmeMutation.mutate()}
              disabled={acmeMutation.isPending}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
            >
              <RefreshCw className={`h-4 w-4 ${acmeMutation.isPending ? "animate-spin" : ""}`} />
              {acmeMutation.isPending ? "Pushing…" : "Retry ACME Push"}
            </button>
            {acmeMutation.isSuccess && <p className="text-sm text-green-600 mt-2 text-center">Push triggered</p>}
          </div>

          {/* Reschedule controls */}
          {!booking.rescheduleDisabled && (
            <div className="card">
              <h2 className="font-semibold mb-3">Self-Serve Reschedule</h2>
              <p className="text-xs text-gray-500 mb-3">Disable to prevent the customer from rescheduling themselves.</p>
              <button
                onClick={() => disableRescheduleMutation.mutate()}
                disabled={disableRescheduleMutation.isPending}
                className="btn-secondary w-full text-sm"
              >
                Disable Reschedule Link
              </button>
            </div>
          )}
          {booking.rescheduleDisabled && (
            <div className="card bg-amber-50 border-amber-200">
              <p className="text-xs text-amber-800">Self-serve reschedule link is disabled for this booking.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
