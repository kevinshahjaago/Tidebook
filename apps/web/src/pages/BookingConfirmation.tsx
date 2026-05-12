import React from "react";
import { useLocation, Link } from "react-router-dom";
import { CheckCircle, Clock, Fish } from "lucide-react";
import { BookingStatus } from "@tidebook/shared";

interface LocationState {
  bookingId: string;
  status: BookingStatus;
  visitDate: string;
  arrivalTimeSlot: string;
  rescheduleToken: string;
}

export default function BookingConfirmation() {
  const location = useLocation();
  const state = location.state as LocationState | null;

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-gray-600">No booking information found.</p>
          <Link to="/book" className="btn-primary mt-4 inline-block">Start a new booking</Link>
        </div>
      </div>
    );
  }

  const isConfirmed = state.status === BookingStatus.CONFIRMED;

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: "linear-gradient(160deg, #002A36 0%, #005568 55%, #0083A0 100%)" }}>
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <Fish className="h-8 w-8 text-white mx-auto mb-2" />
          <h1 className="text-xl font-bold text-white">Seattle Aquarium</h1>
        </div>

        <div className="card text-center">
          <div className="flex justify-center mb-4">
            {isConfirmed ? (
              <CheckCircle className="h-16 w-16 text-green-500" />
            ) : (
              <Clock className="h-16 w-16 text-amber-500" />
            )}
          </div>

          <h2 className="text-2xl font-bold mb-2">
            {isConfirmed ? "Visit Confirmed!" : "Request Received"}
          </h2>

          <p className="text-gray-600 mb-6">
            {isConfirmed
              ? "Your group visit is confirmed. Check your email for full details and your reschedule link."
              : "We've received your request and will be in touch within 2 business days to confirm."}
          </p>

          <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2 text-sm mb-6">
            <div className="flex justify-between">
              <span className="text-gray-600">Reference</span>
              <span className="font-mono text-xs">{state.bookingId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Visit date</span>
              <span className="font-medium">{state.visitDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Arrival time</span>
              <span className="font-medium">{state.arrivalTimeSlot}</span>
            </div>
          </div>

          {isConfirmed && state.rescheduleToken && (
            <p className="text-xs text-gray-500 mb-4">
              A confirmation email with your reschedule link has been sent to your email address.
            </p>
          )}

          <Link to="/book" className="btn-secondary w-full block text-center">
            Submit another booking
          </Link>
        </div>
      </div>
    </div>
  );
}
