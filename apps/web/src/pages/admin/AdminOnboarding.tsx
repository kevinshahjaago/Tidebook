import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Calendar,
  BookOpen,
  ClipboardList,
  Award,
  Users,
  Settings,
  BarChart3,
  Fish,
  ArrowRight,
  GraduationCap,
  Clock,
  CheckCheck,
  AlertCircle,
  Mail,
  RefreshCw,
  Download,
  Ticket,
  UserCog,
  Network,
} from "lucide-react";

const STORAGE_KEY = "tidebook_onboarding_checks";

const SETUP_CHECKLIST = [
  {
    id: "publish_season",
    title: "Publish the current season",
    description:
      "Without a published season, the public booking calendar shows all dates as unavailable. Go to Seasons & Capacity → click the season → Publish Season.",
    link: "/admin/seasons",
    linkLabel: "Go to Seasons",
    critical: true,
  },
  {
    id: "verify_classes",
    title: "Verify class offerings are active",
    description:
      "Check that the classes you offer this season are marked Active. Inactive classes won't appear in the public booking flow.",
    link: "/admin/classes",
    linkLabel: "Go to Classes",
    critical: true,
  },
  {
    id: "test_booking",
    title: "Submit a test booking",
    description:
      "Open the public booking form in an incognito window and walk through it as a teacher. This confirms the calendar, capacity, and emails are all working.",
    link: "/book",
    linkLabel: "Open /book",
    critical: true,
  },
  {
    id: "review_templates",
    title: "Review email templates",
    description:
      "Check the confirmation and reminder email templates. The default templates are functional but you may want to update the wording, survey link, or code-of-conduct URL.",
    link: "/admin/settings",
    linkLabel: "Go to Settings",
    critical: false,
  },
  {
    id: "set_capacity",
    title: "Review capacity settings",
    description:
      "The default daily capacity is 300 people. Adjust this or set per-date overrides (including blackout days for holidays) in Seasons & Capacity.",
    link: "/admin/seasons",
    linkLabel: "Go to Seasons",
    critical: false,
  },
  {
    id: "add_staff",
    title: "Add other staff accounts",
    description:
      "Create accounts for other Registrars or read-only staff. Each person should have their own login — do not share credentials.",
    link: "/admin/users",
    linkLabel: "Go to Users",
    critical: false,
  },
];

export default function AdminOnboarding() {
  const { user } = useAuth();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>("confirm");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setChecked(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const completedCount = SETUP_CHECKLIST.filter((c) => checked[c.id]).length;
  const allDone = completedCount === SETUP_CHECKLIST.length;
  const criticalDone = SETUP_CHECKLIST.filter((c) => c.critical).every((c) => checked[c.id]);

  const firstName = user?.email?.split("@")[0] ?? "there";

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Fish className="h-6 w-6 text-aqua-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome{firstName !== "there" ? `, ${firstName}` : ""}!
          </h1>
        </div>
        <p className="text-gray-600 text-sm">
          This guide walks you through Tidebook — what it does, how to get started, and how to handle
          the most common tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — checklist + role */}
        <div className="lg:col-span-1 space-y-4">
          {/* Role card */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <UserCog className="h-4 w-4 text-aqua-700" />
              <h2 className="font-semibold text-gray-900 text-sm">Your Role</h2>
            </div>
            <div className="text-sm text-gray-600 leading-relaxed">
              {user?.role === "ADMIN" && (
                <>
                  <span className="inline-block bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded mb-2">
                    Admin
                  </span>
                  <p>
                    You have full access to all settings, user management, the audit log, and all booking
                    operations. Be careful with settings that affect all users.
                  </p>
                </>
              )}
              {user?.role === "REGISTRAR" && (
                <>
                  <span className="inline-block bg-aqua-100 text-aqua-800 text-xs font-medium px-2 py-0.5 rounded mb-2">
                    Registrar
                  </span>
                  <p>
                    You confirm and manage bookings, handle scholarship reviews, export the Daily Visit Log,
                    and manage class offerings and seasons. You cannot manage staff accounts.
                  </p>
                </>
              )}
              {user?.role === "CONNECTIONS_COORDINATOR" && (
                <>
                  <span className="inline-block bg-purple-100 text-purple-800 text-xs font-medium px-2 py-0.5 rounded mb-2">
                    Connections Coordinator
                  </span>
                  <p>
                    You manage the Connections Partner portal — creating partner accounts, tracking their
                    bookings, and exporting to Raiser's Edge.
                  </p>
                </>
              )}
              {user?.role === "READ_ONLY" && (
                <>
                  <span className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded mb-2">
                    Read Only
                  </span>
                  <p>
                    You can view bookings, analytics, and exports, but cannot make changes. Contact an
                    Admin if you need more access.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Setup checklist */}
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900 text-sm">Getting Started</h2>
              <span className="text-xs text-gray-500">
                {completedCount}/{SETUP_CHECKLIST.length}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-aqua-600 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / SETUP_CHECKLIST.length) * 100}%` }}
              />
            </div>

            {allDone && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">
                <CheckCheck className="h-4 w-4 flex-shrink-0" />
                You're all set! Tidebook is ready.
              </div>
            )}

            {!criticalDone && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                Complete the first 3 steps before announcing the booking form — otherwise teachers won't see any available dates.
              </div>
            )}

            <div className="space-y-3">
              {SETUP_CHECKLIST.map((item) => (
                <div key={item.id} className="group">
                  <div
                    className="flex items-start gap-2 cursor-pointer"
                    onClick={() => toggle(item.id)}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {checked[item.id] ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-300 group-hover:text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${checked[item.id] ? "line-through text-gray-400" : "text-gray-800"}`}>
                        {item.title}
                        {item.critical && !checked[item.id] && (
                          <span className="ml-1.5 text-xs font-normal text-red-600 not-italic no-underline" style={{ textDecoration: 'none' }}>required</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!checked[item.id] && (
                    <div className="ml-6 mt-1">
                      <p className="text-xs text-gray-500 leading-relaxed">{item.description}</p>
                      <Link
                        to={item.link}
                        className="inline-flex items-center gap-1 text-xs text-aqua-700 hover:underline mt-1"
                      >
                        {item.linkLabel}
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Navigation</h2>
            <div className="space-y-1">
              {QUICK_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-gray-700 hover:text-aqua-700 transition-colors"
                >
                  <l.icon className="h-3.5 w-3.5 text-gray-400" />
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right column — workflows */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-1">What You'll Do Every Day</h2>
            <p className="text-sm text-gray-500 mb-4">
              Click a workflow to expand the step-by-step guide.
            </p>

            <div className="space-y-3">
              {WORKFLOWS.map((w) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  expanded={expandedWorkflow === w.id}
                  onToggle={() =>
                    setExpandedWorkflow(expandedWorkflow === w.id ? null : w.id)
                  }
                />
              ))}
            </div>
          </div>

          {/* Section reference */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">What Each Section Does</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SECTION_GUIDE.map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-aqua-200 hover:bg-aqua-50 transition-colors group"
                >
                  <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-gray-100 group-hover:bg-aqua-100 flex items-center justify-center transition-colors">
                    <s.icon className="h-4 w-4 text-gray-500 group-hover:text-aqua-700" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 group-hover:text-aqua-800">
                      {s.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      {s.description}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* More resources */}
          <div className="card bg-aqua-50 border-aqua-200">
            <h2 className="font-semibold text-aqua-900 mb-3">Documentation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DOCS.map((d) => (
                <div key={d.title} className="flex items-start gap-2">
                  <ChevronRight className="h-4 w-4 text-aqua-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-aqua-900">{d.title}</div>
                    <div className="text-xs text-aqua-700 mt-0.5">{d.description}</div>
                    <code className="text-xs text-aqua-600 font-mono">{d.file}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Workflow cards ────────────────────────────────────────────────────────────

interface WorkflowStep {
  action: string;
  detail?: string;
}

interface Workflow {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  color: string;
  steps: WorkflowStep[];
}

function WorkflowCard({
  workflow,
  expanded,
  onToggle,
}: {
  workflow: Workflow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${expanded ? "border-aqua-300" : "border-gray-200"}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${expanded ? "bg-aqua-50" : ""}`}
      >
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${workflow.color}`}>
          <workflow.icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900">{workflow.title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{workflow.subtitle}</div>
        </div>
        <ChevronRight
          className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-white">
          <ol className="space-y-3">
            {workflow.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex-shrink-0 h-5 w-5 rounded-full bg-aqua-100 text-aqua-800 text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <div className="text-sm text-gray-800">{step.action}</div>
                  {step.detail && (
                    <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.detail}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

const WORKFLOWS: Workflow[] = [
  {
    id: "confirm",
    icon: CheckCircle2,
    title: "Confirming a booking",
    subtitle: "The most common daily task — happens every time a school submits",
    color: "bg-green-100 text-green-700",
    steps: [
      {
        action: "Check the Dashboard for pending bookings",
        detail: "The 'Pending Review' count on the dashboard updates in real time. Click it to go straight to the filtered list.",
      },
      {
        action: "Click a pending booking to open the detail view",
        detail: "You'll see the full booking: group name, visit date, arrival time, class session, payment method, and any special requests or accessibility needs.",
      },
      {
        action: "Review the details",
        detail: "For standard paid bookings, this is a quick check. For scholarship requests, review the uploaded documentation (accessible via the Scholarships section).",
      },
      {
        action: "Click Confirm",
        detail: "This sends a confirmation email to the school, creates an order in ACME, and moves the booking to Confirmed status. The booking now appears in the Daily Visit Log.",
      },
      {
        action: "Or click Decline and enter a reason",
        detail: "A decline email goes to the school with the reason. The booking's headcount is immediately released back to that day's capacity.",
      },
    ],
  },
  {
    id: "dvl",
    icon: ClipboardList,
    title: "Exporting the Daily Visit Log",
    subtitle: "Used by operations staff to prepare for each day's groups",
    color: "bg-blue-100 text-blue-700",
    steps: [
      {
        action: "Navigate to Daily Visit Log in the sidebar",
      },
      {
        action: "Set the date range",
        detail: "For a single day's log, set both start and end to the same date. For a weekly export, set the full week range.",
      },
      {
        action: "Click Export CSV",
        detail: "The CSV opens in Excel and includes: arrival time, group name, group type, student count, adult count, class sessions, payment method, and ACME order number.",
      },
      {
        action: "Share with operations / floor staff",
        detail: "Operations use this list to greet groups by name, verify headcounts at check-in, and route groups to their class sessions.",
      },
    ],
  },
  {
    id: "scholarship",
    icon: Award,
    title: "Reviewing a scholarship application",
    subtitle: "Schools applying for subsidized visits submit documentation through the booking form",
    color: "bg-amber-100 text-amber-700",
    steps: [
      {
        action: "Go to Scholarships in the sidebar",
        detail: "New applications appear with status 'Submitted'. Applications under active review show 'Under Review'.",
      },
      {
        action: "Click an application to open it",
        detail: "You'll see the school's Title I status, enrollment count, qualifying information, and a link to the uploaded supporting document (PDF or image).",
      },
      {
        action: "Download and review the document",
        detail: "Typically a letter from the district confirming Title I status or free/reduced lunch eligibility.",
      },
      {
        action: "Enter the budget amount approved (if approving)",
        detail: "This is recorded for budget tracking but does not affect the booking directly.",
      },
      {
        action: "Click Approve or Deny, and add review notes",
        detail: "An email goes to the school immediately. If approved, the booking is not automatically confirmed — you still need to confirm the booking separately.",
      },
    ],
  },
  {
    id: "season",
    icon: Calendar,
    title: "Opening a new season",
    subtitle: "Done once per school year — makes the booking calendar live",
    color: "bg-purple-100 text-purple-700",
    steps: [
      {
        action: "Go to Seasons & Capacity",
      },
      {
        action: "Click New Season and fill in the details",
        detail: "Set the season name, the date range visits can occur (e.g., Sep–Jun), when registration opens and closes, and the default daily headcount capacity.",
      },
      {
        action: "Save the season — it's not live yet",
        detail: "Saving creates the season in draft state. The public calendar still shows all dates as unavailable.",
      },
      {
        action: "Set any per-date overrides or blackout days",
        detail: "Use the capacity calendar to block school holidays, aquarium events, or dates with lower capacity. You can also override specific dates to allow higher headcounts.",
      },
      {
        action: "Click Publish Season",
        detail: "The booking form is now live for the dates in this season's range. Registration opens and closes automatically at the times you set.",
      },
    ],
  },
  {
    id: "acme_retry",
    icon: RefreshCw,
    title: "Retrying a failed ACME push",
    subtitle: "Occasionally ACME is temporarily down — bookings still go through, ACME order is missing",
    color: "bg-orange-100 text-orange-700",
    steps: [
      {
        action: "Filter the booking list by Confirmed status",
        detail: "Bookings with a failed ACME push show an orange 'ACME Failed' badge.",
      },
      {
        action: "Open the affected booking",
        detail: "The internal notes section will contain a system message: '[SYSTEM] ACME push failed at...'",
      },
      {
        action: "Click 'Retry ACME Push'",
        detail: "If ACME is back up, the order number is created and stored. The booking is now fully reconciled.",
      },
      {
        action: "If the retry fails again, enter the order number manually",
        detail: "Log into ACME directly, find or create the order, and paste the order number into the ACME Order Number field on the booking.",
      },
    ],
  },
];

// ─── Section guide ─────────────────────────────────────────────────────────────

const SECTION_GUIDE = [
  {
    to: "/admin/dashboard",
    icon: Clock,
    label: "Dashboard",
    description: "Pending bookings queue, today's visits, and key metrics at a glance.",
  },
  {
    to: "/admin/bookings",
    icon: BookOpen,
    label: "Bookings",
    description: "Full list of all bookings with filters by status, date, and group type.",
  },
  {
    to: "/admin/dvl",
    icon: ClipboardList,
    label: "Daily Visit Log",
    description: "Export the day's confirmed visits as CSV for operations and floor staff.",
  },
  {
    to: "/admin/scholarships",
    icon: Award,
    label: "Scholarships",
    description: "Review and approve or deny scholarship applications with uploaded documentation.",
  },
  {
    to: "/admin/classes",
    icon: GraduationCap,
    label: "Classes",
    description: "Manage class offerings — name, grade range, capacity, and active status.",
  },
  {
    to: "/admin/seasons",
    icon: Calendar,
    label: "Seasons & Capacity",
    description: "Publish seasons, set daily headcount limits, and configure blackout dates.",
  },
  {
    to: "/admin/analytics",
    icon: BarChart3,
    label: "Analytics",
    description: "Booking counts by status, group type, payment method, and date range.",
  },
  {
    to: "/admin/settings",
    icon: Settings,
    label: "Settings",
    description: "Email templates, app-wide settings (chaperone ratio, survey URL, etc.).",
  },
  {
    to: "/admin/users",
    icon: Users,
    label: "Users",
    description: "Manage staff accounts, roles, and force-logout compromised sessions.",
  },
  {
    to: "/admin/architecture",
    icon: Network,
    label: "Architecture",
    description: "How Tidebook works — system overview for IT and non-technical staff.",
  },
];

// ─── Quick links ───────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { to: "/admin/bookings?status=PENDING", icon: Clock, label: "Pending bookings" },
  { to: "/admin/scholarships", icon: Award, label: "Scholarship queue" },
  { to: "/admin/dvl", icon: Download, label: "Export today's DVL" },
  { to: "/admin/seasons", icon: Calendar, label: "Season settings" },
  { to: "/admin/settings", icon: Mail, label: "Email templates" },
  { to: "/admin/users", icon: Users, label: "Manage staff" },
  { to: "/admin/architecture", icon: Network, label: "System overview" },
];

// ─── Docs reference ───────────────────────────────────────────────────────────

const DOCS = [
  {
    title: "Operations Runbook",
    description: "Step-by-step guides for common admin tasks",
    file: "docs/RUNBOOK.md",
  },
  {
    title: "Deployment Guide",
    description: "Server setup, env vars, DNS, backup cron",
    file: "docs/DEPLOYMENT.md",
  },
  {
    title: "Security",
    description: "PII encryption, credentials, incident response",
    file: "docs/SECURITY.md",
  },
  {
    title: "Backup & Recovery",
    description: "Restore procedure, RTO, encryption key loss",
    file: "docs/BACKUP_AND_RECOVERY.md",
  },
];
