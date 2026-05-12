import React from "react";
import { Link } from "react-router-dom";
import { Fish } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Fish className="h-16 w-16 text-aqua-300 mx-auto mb-4" />
        <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
        <p className="text-gray-600 mb-6">Page not found</p>
        <Link to="/book" className="btn-primary">Go to booking</Link>
      </div>
    </div>
  );
}
