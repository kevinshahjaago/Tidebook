import React, { useState } from "react";
import {
  Globe,
  Server,
  Database,
  Shield,
  Mail,
  Network,
  Users,
  Building2,
  UserCog,
  ChevronRight,
  Lock,
  Key,
  Eye,
  EyeOff,
  Ticket,
  ArrowDown,
  Cpu,
  Fish,
  BookOpen,
  ClipboardList,
  RefreshCw,
} from "lucide-react";

type Tab = "overview" | "system" | "security";

export default function AdminArchitecture() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">How Tidebook Works</h1>
        <p className="text-gray-600 text-sm mt-1">
          System overview for registrars, IT staff, and anyone who wants to
          understand how the pieces fit together.
        </p>
      </div>

      <div className="flex gap-0 mb-6 border-b border-gray-200">
        {(
          [
            { id: "overview" as Tab, label: "Overview" },
            { id: "system" as Tab, label: "Technical Architecture" },
            { id: "security" as Tab, label: "Data & Security" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-aqua-700 text-aqua-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "system" && <SystemTab />}
      {tab === "security" && <SecurityTab />}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="space-y-6">
      {/* What is Tidebook */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-aqua-100 flex items-center justify-center">
            <Fish className="h-5 w-5 text-aqua-700" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">What is Tidebook?</h2>
            <p className="text-gray-600 text-sm mt-1 leading-relaxed">
              Tidebook is the Seattle Aquarium's group booking system for school and community visits.
              It replaced a patchwork of spreadsheets, email, and a third-party scheduling tool with a
              single system that handles everything from a school's first visit request through to the
              day-of check-in list.
            </p>
            <p className="text-gray-600 text-sm mt-2 leading-relaxed">
              At its core, Tidebook does three things: it lets schools book themselves (no phone tag),
              it helps the Registrar manage and confirm those bookings, and it automatically sends the
              right emails at the right time.
            </p>
          </div>
        </div>
      </div>

      {/* Who uses it */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Who Uses Tidebook?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UserTypeCard
            icon={<GraduationIcon />}
            title="School Groups & Teachers"
            color="blue"
            items={[
              "Submit a visit request at /book",
              "Choose a date, class, and arrival time",
              "Get confirmation emails automatically",
              "Reschedule or cancel via a link in their email",
            ]}
          />
          <UserTypeCard
            icon={<Building2 className="h-5 w-5" />}
            title="Connections Partners"
            color="purple"
            items={[
              "Subsidized visit program for community organizations",
              "Log in at /connections with their own account",
              "Submit and track their own bookings",
              "Managed separately by a Connections Coordinator",
            ]}
          />
          <UserTypeCard
            icon={<ClipboardList className="h-5 w-5" />}
            title="Registrar / Staff"
            color="green"
            items={[
              "Review and confirm or decline pending bookings",
              "Manage scholarships and bus reimbursements",
              "Export the Daily Visit Log (DVL) for operations",
              "Manage class offerings, seasons, and capacity",
            ]}
          />
          <UserTypeCard
            icon={<UserCog className="h-5 w-5" />}
            title="Admin / IT"
            color="orange"
            items={[
              "Manage staff user accounts and permissions",
              "Configure email templates and app settings",
              "Monitor the audit log for all system actions",
              "Maintain backups, credentials, and the server",
            ]}
          />
        </div>
      </div>

      {/* Booking lifecycle */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-6">What Happens When a School Books?</h2>
        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gray-200" />
          <div className="space-y-6">
            {BOOKING_STEPS.map((step, i) => (
              <div key={i} className="flex gap-4 relative">
                <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center z-10 ${step.bg}`}>
                  <span className="text-sm font-bold">{i + 1}</span>
                </div>
                <div className="pt-1.5 pb-2">
                  <div className="font-medium text-gray-900 text-sm">{step.title}</div>
                  <div className="text-gray-600 text-sm mt-0.5">{step.description}</div>
                  {step.note && (
                    <div className="text-xs text-gray-500 mt-1 italic">{step.note}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key concepts */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Key Concepts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {KEY_CONCEPTS.map((c) => (
            <div key={c.title} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 mt-0.5 text-aqua-700">{c.icon}</div>
              <div>
                <div className="text-sm font-medium text-gray-900">{c.title}</div>
                <div className="text-sm text-gray-600 mt-0.5">{c.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const BOOKING_STEPS = [
  {
    title: "School submits a booking request",
    description:
      "A teacher visits /book, selects their group type, picks an available date from the calendar, fills in contact information, optionally adds a class session, and submits.",
    note: "The calendar automatically shows unavailable dates when the daily capacity limit (default: 300 people) is reached.",
    bg: "bg-aqua-100 text-aqua-800",
  },
  {
    title: "Tidebook checks availability and creates the booking",
    description:
      "The system instantly checks that the date has capacity, that the chosen classes have open slots, and that the season is open for registration. It then creates the booking in the database.",
    note: "Two schools submitting at the exact same moment are handled safely — only one will succeed if capacity is tight.",
    bg: "bg-blue-100 text-blue-800",
  },
  {
    title: "Confirmation email sent automatically",
    description:
      "For paid bookings, a confirmation email goes out immediately. For scholarship applications or bookings needing accessibility review, a 'pending review' email goes out instead.",
    note: "All emails are sent with DKIM signing to ensure they land in the inbox, not spam.",
    bg: "bg-purple-100 text-purple-800",
  },
  {
    title: "Registrar reviews pending bookings",
    description:
      "The Registrar sees all pending bookings in the admin dashboard. For standard bookings, this is a formality. For scholarship requests, the Registrar reviews the uploaded documentation and approves or denies.",
    bg: "bg-amber-100 text-amber-800",
  },
  {
    title: "Booking confirmed — ACME order created",
    description:
      "When the Registrar confirms, a confirmation email goes to the school and the booking data is sent to ACME (the Aquarium's ticketing system) to create an order. The ACME order number is stored for reconciliation.",
    bg: "bg-green-100 text-green-800",
  },
  {
    title: "Reminders sent 14 days before the visit",
    description:
      "An automated reminder email with visit logistics (chaperone ratio, arrival instructions, code of conduct) goes out 14 days before the visit date.",
    bg: "bg-teal-100 text-teal-800",
  },
  {
    title: "Visit day — Daily Visit Log",
    description:
      "Operations staff export the Daily Visit Log (DVL) from the admin dashboard. It lists every confirmed group arriving that day: time, headcount, class sessions, and ACME order number.",
    bg: "bg-orange-100 text-orange-800",
  },
  {
    title: "Post-visit survey email",
    description:
      "A few days after the visit, a feedback survey email goes out automatically. Responses go to the Aquarium's existing survey system.",
    bg: "bg-pink-100 text-pink-800",
  },
];

const KEY_CONCEPTS = [
  {
    icon: <Users className="h-4 w-4" />,
    title: "Daily headcount capacity",
    description:
      "Each day has a configurable maximum total headcount (students + adults). Once that cap is reached, the date shows as unavailable to new bookers. Pending bookings count against capacity.",
  },
  {
    icon: <RefreshCw className="h-4 w-4" />,
    title: "Self-serve reschedule links",
    description:
      "Every confirmation email includes a personal link the school can use to reschedule their visit without calling. The link expires 48 hours before the visit date.",
  },
  {
    icon: <BookOpen className="h-4 w-4" />,
    title: "Seasons",
    description:
      "Booking availability is gated by a published season with a registration open/close window. No season = no available dates on the calendar. The Registrar publishes a new season at the start of each school year.",
  },
  {
    icon: <Ticket className="h-4 w-4" />,
    title: "ACME integration",
    description:
      "When a booking is confirmed, Tidebook sends the booking details to ACME (the Aquarium's ticketing/POS system) and stores the returned order number. If ACME is temporarily down, the booking still goes through and the Registrar can retry the ACME push manually.",
  },
];

function UserTypeCard({
  icon,
  title,
  color,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  color: "blue" | "purple" | "green" | "orange";
  items: string[];
}) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    green: "bg-green-50 border-green-200 text-green-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
  };
  const iconColors = {
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
    green: "bg-green-100 text-green-700",
    orange: "bg-orange-100 text-orange-700",
  };

  return (
    <div className={`border rounded-lg p-4 ${colors[color].split(" ").slice(1).join(" ")} bg-white`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconColors[color]}`}>
          {icon}
        </div>
        <span className="font-medium text-gray-900 text-sm">{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
            <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GraduationIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

// ─── System Architecture Tab ───────────────────────────────────────────────────

function SystemTab() {
  return (
    <div className="space-y-6">
      {/* Diagram */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-1">Infrastructure</h2>
        <p className="text-sm text-gray-500 mb-6">
          All components run as Docker containers on a single Linux server.
        </p>
        <ArchitectureDiagram />
      </div>

      {/* Services table */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Containers & Services</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="pb-2 pr-4 font-medium text-gray-700">Container</th>
                <th className="pb-2 pr-4 font-medium text-gray-700">Image</th>
                <th className="pb-2 pr-4 font-medium text-gray-700">Port</th>
                <th className="pb-2 font-medium text-gray-700">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SERVICES.map((s) => (
                <tr key={s.name}>
                  <td className="py-2.5 pr-4 font-mono text-xs text-gray-800">{s.name}</td>
                  <td className="py-2.5 pr-4 text-gray-600 font-mono text-xs">{s.image}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-aqua-700">{s.port}</td>
                  <td className="py-2.5 text-gray-600">{s.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ports / Firewall */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Firewall Rules</h2>
        <p className="text-sm text-gray-600 mb-4">
          Only two ports should be open to the internet. Everything else is internal to the Docker network.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="pb-2 pr-4 font-medium text-gray-700">Port</th>
                <th className="pb-2 pr-4 font-medium text-gray-700">Protocol</th>
                <th className="pb-2 pr-4 font-medium text-gray-700">Open to</th>
                <th className="pb-2 font-medium text-gray-700">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2.5 pr-4 font-mono text-xs text-green-700">80</td>
                <td className="py-2.5 pr-4 text-gray-600">TCP</td>
                <td className="py-2.5 pr-4 text-gray-600">Internet</td>
                <td className="py-2.5 text-gray-600">HTTP — redirects to HTTPS</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-mono text-xs text-green-700">443</td>
                <td className="py-2.5 pr-4 text-gray-600">TCP</td>
                <td className="py-2.5 pr-4 text-gray-600">Internet</td>
                <td className="py-2.5 text-gray-600">HTTPS — all traffic</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-mono text-xs text-amber-700">22</td>
                <td className="py-2.5 pr-4 text-gray-600">TCP</td>
                <td className="py-2.5 pr-4 text-gray-600">IT IPs only</td>
                <td className="py-2.5 text-gray-600">SSH server administration</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-mono text-xs text-red-600">4000</td>
                <td className="py-2.5 pr-4 text-gray-600">TCP</td>
                <td className="py-2.5 pr-4 text-red-600">Blocked</td>
                <td className="py-2.5 text-gray-600">API — internal Docker network only</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-mono text-xs text-red-600">5432</td>
                <td className="py-2.5 pr-4 text-gray-600">TCP</td>
                <td className="py-2.5 pr-4 text-red-600">Blocked</td>
                <td className="py-2.5 text-gray-600">PostgreSQL — internal Docker network only</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Server requirements */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Server Requirements</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "CPU", value: "2+ cores" },
            { label: "RAM", value: "4 GB minimum" },
            { label: "Disk", value: "50 GB minimum" },
            { label: "OS", value: "Ubuntu 22.04 LTS" },
          ].map((r) => (
            <div key={r.label} className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-lg font-bold text-gray-900">{r.value}</div>
              <div className="text-sm text-gray-500 mt-1">{r.label}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Requires Docker Engine ≥ 24 and Docker Compose ≥ 2.20. See{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">docs/DEPLOYMENT.md</code> for the
          complete setup guide.
        </p>
      </div>
    </div>
  );
}

const SERVICES = [
  {
    name: "tidebook-web-1",
    image: "nginx:alpine",
    port: ":80 / :443",
    purpose: "Serves the React app and proxies /api/v1/* to the API container",
  },
  {
    name: "tidebook-api-1",
    image: "node:20-alpine (built)",
    port: ":4000 (internal)",
    purpose: "Express REST API — booking logic, auth, email, ACME integration",
  },
  {
    name: "tidebook-db-1",
    image: "postgres:16-alpine",
    port: ":5432 (internal)",
    purpose: "PostgreSQL database — all bookings, users, audit log, settings",
  },
];

function ArchitectureDiagram() {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px] max-w-2xl mx-auto font-sans text-sm">

        {/* Browser */}
        <div className="flex justify-center">
          <DiagramBox
            icon={<Globe className="h-4 w-4" />}
            title="Browser / Users"
            subtitle="School teachers · Registrar staff · Connections Partners"
            colorClass="bg-blue-50 border-blue-300 text-blue-800"
            className="w-80"
          />
        </div>

        <Connector label="HTTPS :443" />

        {/* Nginx */}
        <div className="flex justify-center">
          <DiagramBox
            icon={<Network className="h-4 w-4" />}
            title="Nginx Reverse Proxy"
            subtitle=":80 → redirect HTTPS   ·   :443 SSL termination"
            colorClass="bg-purple-50 border-purple-300 text-purple-800"
            className="w-full"
          />
        </div>

        {/* Split */}
        <div className="flex mt-0">
          <div className="flex-1 flex flex-col items-center py-1">
            <div className="w-px h-3 bg-gray-300" />
            <span className="text-xs text-gray-400 font-mono">/ static</span>
            <div className="w-px h-3 bg-gray-300" />
            <ArrowDown className="h-3 w-3 text-gray-400" />
          </div>
          <div className="flex-1 flex flex-col items-center py-1">
            <div className="w-px h-3 bg-gray-300" />
            <span className="text-xs text-gray-400 font-mono">/api/v1/*</span>
            <div className="w-px h-3 bg-gray-300" />
            <ArrowDown className="h-3 w-3 text-gray-400" />
          </div>
        </div>

        {/* App services */}
        <div className="flex gap-3">
          <div className="flex-1">
            <DiagramBox
              icon={<Cpu className="h-4 w-4" />}
              title="React SPA"
              subtitle={"TypeScript · Vite · Tailwind CSS\nReact Query · React Hook Form"}
              colorClass="bg-cyan-50 border-cyan-300 text-cyan-800"
            />
          </div>
          <div className="flex-1">
            <DiagramBox
              icon={<Server className="h-4 w-4" />}
              title="Express API  :4000"
              subtitle={"Node.js · JWT auth · Zod validation\nAES-256 PII encryption"}
              colorClass="bg-green-50 border-green-300 text-green-800"
            />
          </div>
        </div>

        {/* Arrow from API to DB (right side only) */}
        <div className="flex">
          <div className="flex-1" />
          <div className="flex-1 flex flex-col items-center py-1">
            <div className="w-px h-3 bg-gray-300" />
            <span className="text-xs text-gray-400 font-mono">Prisma ORM</span>
            <div className="w-px h-3 bg-gray-300" />
            <ArrowDown className="h-3 w-3 text-gray-400" />
          </div>
        </div>

        {/* PostgreSQL */}
        <div className="flex gap-3">
          <div className="flex-1" />
          <div className="flex-1">
            <DiagramBox
              icon={<Database className="h-4 w-4" />}
              title="PostgreSQL  :5432"
              subtitle={"Docker volume · Encrypted PII\nAudit log · 30-day backups"}
              colorClass="bg-orange-50 border-orange-300 text-orange-800"
            />
          </div>
        </div>

        {/* External services */}
        <div className="mt-5 pt-4 border-t-2 border-dashed border-gray-200">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center mb-3">
            External Integrations
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <DiagramBox
                icon={<Mail className="h-4 w-4" />}
                title="SMTP Provider"
                subtitle={"Email delivery · DKIM signed\nSendGrid / any SMTP server"}
                colorClass="bg-gray-50 border-gray-300 text-gray-700"
                dashed
              />
            </div>
            <div className="flex-1">
              <DiagramBox
                icon={<Ticket className="h-4 w-4" />}
                title="ACME Ticketing"
                subtitle={"Order creation on confirmation\nMock adapter used in dev/test"}
                colorClass="bg-gray-50 border-gray-300 text-gray-700"
                dashed
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagramBox({
  icon,
  title,
  subtitle,
  colorClass,
  className = "",
  dashed = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  colorClass: string;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <div
      className={`${colorClass} ${dashed ? "border-dashed" : "border"} rounded-lg px-4 py-3 ${className}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <div className="text-xs opacity-75 whitespace-pre-line leading-relaxed">{subtitle}</div>
    </div>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-3 bg-gray-300" />
      <span className="text-xs text-gray-400 font-mono">{label}</span>
      <div className="w-px h-3 bg-gray-300" />
      <ArrowDown className="h-3 w-3 text-gray-400" />
    </div>
  );
}

// ─── Security Tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  return (
    <div className="space-y-6">
      {/* PII collected */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-1">What Personal Information Is Collected?</h2>
        <p className="text-sm text-gray-600 mb-4">
          Tidebook collects the minimum information needed to manage a group visit. No individual
          student data is collected at any point.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="pb-2 pr-4 font-medium text-gray-700">Field</th>
                <th className="pb-2 pr-4 font-medium text-gray-700">Who it belongs to</th>
                <th className="pb-2 pr-4 font-medium text-gray-700">Why collected</th>
                <th className="pb-2 font-medium text-gray-700">Encrypted at rest?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PII_TABLE.map((row) => (
                <tr key={row.field}>
                  <td className="py-2.5 pr-4 font-mono text-xs text-gray-800">{row.field}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{row.who}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{row.why}</td>
                  <td className="py-2.5">
                    {row.encrypted ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <Lock className="h-3 w-3" /> Yes — AES-256
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">No — not sensitive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* COPPA / FERPA */}
      <div className="card border-l-4 border-l-green-500">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-900">COPPA & FERPA: No Student Data Collected</h2>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
              Tidebook collects <strong>no individual student information</strong> — no names, dates of
              birth, student ID numbers, or any other personally identifying information about minors.
              Only group-level data is stored (headcount and grade range).
            </p>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              This is a deliberate design decision to eliminate COPPA (Children's Online Privacy
              Protection Act) and FERPA (Family Educational Rights and Privacy Act) exposure. All
              contact data belongs to adult teachers or administrators. The system was designed
              this way from the start, not retrofitted.
            </p>
          </div>
        </div>
      </div>

      {/* How PII is protected */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">How Personal Information Is Protected</h2>
        <div className="space-y-4">
          {SECURITY_MEASURES.map((m) => (
            <div key={m.title} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 mt-0.5 text-aqua-700">{m.icon}</div>
              <div>
                <div className="text-sm font-medium text-gray-900">{m.title}</div>
                <div className="text-sm text-gray-600 mt-0.5 leading-relaxed">{m.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit log */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">What Gets Logged?</h2>
        <p className="text-sm text-gray-600 mb-4">
          Every significant action is written to an append-only audit log. Nothing is ever deleted or
          modified. The log is viewable by Admins at{" "}
          <strong>Settings → Audit Log</strong>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AUDIT_EVENTS.map((e) => (
            <div key={e} className="flex items-center gap-2 text-sm text-gray-600">
              <div className="h-1.5 w-1.5 rounded-full bg-aqua-500 flex-shrink-0" />
              {e}
            </div>
          ))}
        </div>
      </div>

      {/* Credential inventory */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Credential Inventory</h2>
        <p className="text-sm text-gray-600 mb-4">
          These secrets live in the <code className="text-xs bg-gray-100 px-1 rounded">.env</code>{" "}
          file on the server. Store the file itself in your organization's password manager. For
          rotation procedures, see <code className="text-xs bg-gray-100 px-1 rounded">docs/SECURITY.md</code>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="pb-2 pr-4 font-medium text-gray-700">Variable</th>
                <th className="pb-2 pr-4 font-medium text-gray-700">What it protects</th>
                <th className="pb-2 font-medium text-gray-700">Effect of rotation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {CREDENTIALS.map((c) => (
                <tr key={c.variable}>
                  <td className="py-2.5 pr-4 font-mono text-xs text-red-700">{c.variable}</td>
                  <td className="py-2.5 pr-4 text-gray-600 text-xs">{c.protects}</td>
                  <td className="py-2.5 text-gray-600 text-xs">{c.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const PII_TABLE = [
  { field: "contactName", who: "Adult teacher / organizer", why: "Identify the lead contact for the booking", encrypted: true },
  { field: "contactEmail", who: "Adult teacher / organizer", why: "Send all booking-related emails", encrypted: true },
  { field: "contactPhone", who: "Adult teacher / organizer", why: "Day-of emergency coordination", encrypted: true },
  { field: "organizationName", who: "School or group", why: "Identify the group in admin views and ACME", encrypted: true },
  { field: "studentCount", who: "Group aggregate", why: "Capacity enforcement and ticketing", encrypted: false },
  { field: "adultCount", who: "Group aggregate", why: "Chaperone ratio verification", encrypted: false },
  { field: "gradeLevels", who: "Group aggregate", why: "Class suitability matching", encrypted: false },
  { field: "EmailLog.toAddress", who: "Adult teacher / organizer", why: "Record of who was emailed", encrypted: true },
];

const SECURITY_MEASURES = [
  {
    icon: <Lock className="h-4 w-4" />,
    title: "AES-256-GCM encryption for all contact PII",
    description:
      "Contact names, emails, and phone numbers are encrypted before they are written to the database. Even if someone gains direct access to the database, they see only ciphertext — not real names or email addresses. Decryption only happens in the application when displaying a booking.",
  },
  {
    icon: <Key className="h-4 w-4" />,
    title: "JWT sessions with immediate revocation",
    description:
      "Staff accounts use short-lived login tokens (15 minutes). Every user record has a version counter. Logging out, changing a password, or an admin force-logout increments this counter, immediately invalidating every active session for that user — no waiting for tokens to expire.",
  },
  {
    icon: <Shield className="h-4 w-4" />,
    title: "HTTPS everywhere — no plain-text traffic",
    description:
      "Nginx forces all HTTP traffic to redirect to HTTPS. The browser-to-server connection is always encrypted. HTTP Strict Transport Security (HSTS) tells browsers never to connect without HTTPS.",
  },
  {
    icon: <Eye className="h-4 w-4" />,
    title: "Rate limiting on all sensitive endpoints",
    description:
      "The public booking form is limited to 10 requests/minute per IP. Login attempts are limited to 5 per 15 minutes, with account lockout after 5 failures. Magic link requests are limited to 3/hour per email address.",
  },
  {
    icon: <EyeOff className="h-4 w-4" />,
    title: "Tokens stored as hashes, never in plaintext",
    description:
      "Reschedule links and magic links use random tokens that are stored as SHA-256 hashes in the database. Even if the database is read directly, an attacker cannot derive a valid reschedule link from the stored hash.",
  },
];

const AUDIT_EVENTS = [
  "Booking created, confirmed, declined, cancelled",
  "Booking rescheduled",
  "Scholarship approved or denied",
  "Staff login and logout",
  "Failed login attempts",
  "Admin force-logout of another user",
  "Email template edited",
  "Season published or unpublished",
  "App settings changed",
  "New staff user created or deactivated",
  "Magic link requested and used",
  "ACME push attempted (success or failure)",
];

const CREDENTIALS = [
  {
    variable: "PII_ENCRYPTION_KEY",
    protects: "All contact names, emails, phone numbers in the database",
    effect: "Requires data migration to re-encrypt existing records. Do not rotate without running the migration script.",
  },
  {
    variable: "JWT_ACCESS_SECRET",
    protects: "Staff and partner login sessions",
    effect: "All active sessions immediately invalidated. All users must log in again.",
  },
  {
    variable: "JWT_REFRESH_SECRET",
    protects: "Long-lived refresh tokens (7 days)",
    effect: "All active sessions immediately invalidated.",
  },
  {
    variable: "POSTGRES_PASSWORD",
    protects: "Database access",
    effect: "Must update in .env and restart services. Existing data is unaffected.",
  },
  {
    variable: "ACME_API_KEY",
    protects: "Ticketing system integration",
    effect: "New bookings cannot push to ACME until updated. Retry failed pushes after rotation.",
  },
  {
    variable: "SMTP_PASS",
    protects: "Outbound email delivery",
    effect: "Emails fail to send until updated. No data loss.",
  },
];
