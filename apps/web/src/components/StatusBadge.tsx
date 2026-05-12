import React from "react";
import { BookingStatus } from "@tidebook/shared";

const STATUS_CONFIG: Record<BookingStatus, { label: string; classes: string }> = {
  [BookingStatus.PENDING]: { label: "Pending Review", classes: "bg-yellow-100 text-yellow-800" },
  [BookingStatus.CONFIRMED]: { label: "Confirmed", classes: "bg-green-100 text-green-800" },
  [BookingStatus.DECLINED]: { label: "Declined", classes: "bg-red-100 text-red-800" },
  [BookingStatus.CANCELLED]: { label: "Cancelled", classes: "bg-gray-100 text-gray-800" },
  [BookingStatus.COMPLETED]: { label: "Completed", classes: "bg-blue-100 text-blue-800" },
  [BookingStatus.WAITLISTED]: { label: "Waitlisted", classes: "bg-purple-100 text-purple-800" },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, classes: "bg-gray-100 text-gray-800" };
  return (
    <span className={`badge ${cfg.classes}`}>{cfg.label}</span>
  );
}
