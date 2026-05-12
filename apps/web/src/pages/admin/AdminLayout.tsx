import React from "react";
import { Outlet, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Calendar,
  CalendarDays,
  CalendarX2,
  Award,
  ClipboardList,
  Settings,
  Users,
  BarChart3,
  LogOut,
  Menu,
  Network,
  Compass,
  Mail,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { to: "dashboard",    icon: LayoutDashboard, label: "Dashboard" },
  { to: "bookings",     icon: BookOpen,        label: "Visit Requests" },
  { to: "dvl",          icon: ClipboardList,   label: "Today's Visits" },
  { to: "schedule",     icon: CalendarDays,    label: "Educator Schedule" },
  { to: "classes",      icon: GraduationCap,   label: "On-Site Programs" },
  { to: "scholarships", icon: Award,           label: "Scholarships" },
  { to: "seasons",      icon: Calendar,        label: "Seasons & Capacity" },
  { to: "capacity",     icon: CalendarX2,      label: "Visit Calendar" },
  { to: "analytics",        icon: BarChart3,       label: "Reports" },
  { to: "email-templates",  icon: Mail,            label: "Email Templates" },
  { to: "settings",         icon: Settings,        label: "Portal Settings" },
  { to: "users",        icon: Users,           label: "Team & Access" },
  { to: "architecture", icon: Network,         label: "System Overview" },
  { to: "onboarding",   icon: Compass,         label: "Getting Started" },
];

export default function AdminLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-aqua-700 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={`flex flex-col h-full ${mobile ? "w-64" : "w-60"}`} style={{ background: "linear-gradient(180deg, #002A36 0%, #003E4E 100%)" }}>
      {/* Brand mark */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-aqua-500/20 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-aqua-300" fill="currentColor">
            {/* Simple wave/fish icon */}
            <path d="M2 12C2 12 5 8 9 8C11.5 8 13.5 9.5 15 11C16.5 12.5 18.5 14 21 14C21 14 18 18 15 18C12.5 18 10.5 16.5 9 15C7.5 13.5 5.5 12 3 12L2 12Z" opacity="0.6"/>
            <path d="M4 10C6 8 9 7 12 9C15 11 18 12 21 10" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round"/>
            <circle cx="19" cy="9" r="1" opacity="0.8"/>
          </svg>
        </div>
        <div>
          <div className="font-semibold text-sm text-white leading-tight">Seattle Aquarium</div>
          <div className="text-[11px] text-aqua-300/80 font-normal">Education Portal</div>
        </div>
      </div>

      {/* Nav links */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={`/admin/${item.to}`}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 mb-0.5 ${
                isActive
                  ? "bg-aqua-700/70 text-white font-medium shadow-sm"
                  : "text-aqua-100/80 hover:text-white hover:bg-white/8"
              }`
            }
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* User footer */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-7 h-7 rounded-full bg-aqua-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-xs font-semibold text-white">
              {user.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-white/90 font-medium truncate">{user.email}</div>
            <div className="text-[11px] text-aqua-300/70 capitalize mt-0.5">{user.role?.toLowerCase().replace(/_/g, " ")}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-aqua-300/80 hover:text-white transition-colors w-full"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900 text-sm">Seattle Aquarium — Education Portal</span>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
