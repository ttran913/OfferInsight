"use client"

import { Calendar } from 'lucide-react';

/**
 * Placeholder for step 1 of monthly 1:1 scheduling.
 * Next slice: Google Calendar connect + availability windows.
 */
export default function CalendarTab() {
  return (
    <div className="border border-gray-200 rounded-lg bg-white px-6 py-10 text-center">
      <Calendar className="w-10 h-10 text-electric-blue mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Calendar</h2>
      <p className="text-gray-500 max-w-md mx-auto">
        Connect Google Calendar and set weekly availability for monthly student 1:1s.
        This setup UI comes in the next step.
      </p>
    </div>
  );
}
