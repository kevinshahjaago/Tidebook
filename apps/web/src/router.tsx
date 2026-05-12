import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import React, { Suspense } from "react";

// Lazy load pages for better perf
const BookingFlow = React.lazy(() => import("./pages/BookingFlow"));
const BookingConfirmation = React.lazy(() => import("./pages/BookingConfirmation"));
const ReschedulePage = React.lazy(() => import("./pages/ReschedulePage"));
const AdminLogin = React.lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = React.lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = React.lazy(() => import("./pages/admin/AdminDashboard"));
const AdminBookings = React.lazy(() => import("./pages/admin/AdminBookings"));
const AdminBookingDetail = React.lazy(() => import("./pages/admin/AdminBookingDetail"));
const AdminClasses = React.lazy(() => import("./pages/admin/AdminClasses"));
const AdminSeasons = React.lazy(() => import("./pages/admin/AdminSeasons"));
const AdminScholarships = React.lazy(() => import("./pages/admin/AdminScholarships"));
const AdminDVL = React.lazy(() => import("./pages/admin/AdminDVL"));
const AdminSettings = React.lazy(() => import("./pages/admin/AdminSettings"));
const AdminUsers = React.lazy(() => import("./pages/admin/AdminUsers"));
const AdminAnalytics = React.lazy(() => import("./pages/admin/AdminAnalytics"));
const ConnectionsPortal = React.lazy(() => import("./pages/connections/ConnectionsPortal"));
const AdminArchitecture = React.lazy(() => import("./pages/admin/AdminArchitecture"));
const AdminCapacity = React.lazy(() => import("./pages/admin/AdminCapacity"));
const AdminOnboarding = React.lazy(() => import("./pages/admin/AdminOnboarding"));
const AdminSchedule = React.lazy(() => import("./pages/admin/AdminSchedule"));
const AdminEmailTemplates = React.lazy(() => import("./pages/admin/AdminEmailTemplates"));
const AdminJourneys = React.lazy(() => import("./pages/admin/AdminJourneys"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-4 border-aqua-700 border-t-transparent" />
  </div>
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/book" replace />,
  },
  {
    path: "/book",
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <BookingFlow />
      </Suspense>
    ),
  },
  {
    path: "/booking/confirmation",
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <BookingConfirmation />
      </Suspense>
    ),
  },
  {
    path: "/reschedule",
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <ReschedulePage />
      </Suspense>
    ),
  },
  {
    path: "/connections",
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <ConnectionsPortal />
      </Suspense>
    ),
  },
  {
    path: "/admin",
    element: (
      <AuthProvider>
        <Suspense fallback={<LoadingSpinner />}>
          <AdminLayout />
        </Suspense>
      </AuthProvider>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: "dashboard", element: <Suspense fallback={<LoadingSpinner />}><AdminDashboard /></Suspense> },
      { path: "bookings", element: <Suspense fallback={<LoadingSpinner />}><AdminBookings /></Suspense> },
      { path: "bookings/:id", element: <Suspense fallback={<LoadingSpinner />}><AdminBookingDetail /></Suspense> },
      { path: "classes", element: <Suspense fallback={<LoadingSpinner />}><AdminClasses /></Suspense> },
      { path: "seasons", element: <Suspense fallback={<LoadingSpinner />}><AdminSeasons /></Suspense> },
      { path: "capacity", element: <Suspense fallback={<LoadingSpinner />}><AdminCapacity /></Suspense> },
      { path: "schedule", element: <Suspense fallback={<LoadingSpinner />}><AdminSchedule /></Suspense> },
      { path: "scholarships", element: <Suspense fallback={<LoadingSpinner />}><AdminScholarships /></Suspense> },
      { path: "dvl", element: <Suspense fallback={<LoadingSpinner />}><AdminDVL /></Suspense> },
      { path: "settings", element: <Suspense fallback={<LoadingSpinner />}><AdminSettings /></Suspense> },
      { path: "users", element: <Suspense fallback={<LoadingSpinner />}><AdminUsers /></Suspense> },
      { path: "analytics", element: <Suspense fallback={<LoadingSpinner />}><AdminAnalytics /></Suspense> },
      { path: "architecture", element: <Suspense fallback={<LoadingSpinner />}><AdminArchitecture /></Suspense> },
      { path: "onboarding", element: <Suspense fallback={<LoadingSpinner />}><AdminOnboarding /></Suspense> },
      { path: "email-templates", element: <Suspense fallback={<LoadingSpinner />}><AdminEmailTemplates /></Suspense> },
      { path: "journeys", element: <Suspense fallback={<LoadingSpinner />}><AdminJourneys /></Suspense> },
    ],
  },
  {
    path: "/admin/login",
    element: (
      <AuthProvider>
        <Suspense fallback={<LoadingSpinner />}>
          <AdminLogin />
        </Suspense>
      </AuthProvider>
    ),
  },
  {
    path: "*",
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <NotFound />
      </Suspense>
    ),
  },
]);
