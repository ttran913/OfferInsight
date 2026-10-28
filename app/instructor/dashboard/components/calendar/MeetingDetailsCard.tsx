"use client"

import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import {
  MEETING_LOCATION_MAX_LENGTH,
  MEETING_LOCATION_PLACEHOLDERS,
  MEETING_LOCATION_TYPE_LABELS,
  MEETING_LOCATION_TYPES,
  type MeetingLocationType,
} from '@/app/lib/calendar/meeting-details';

type Props = {
  initialType: MeetingLocationType;
  initialLocation: string;
  initialContactEmail: string;
};

export default function MeetingDetailsCard({
  initialType,
  initialLocation,
  initialContactEmail,
}: Props) {
  const [savedType, setSavedType] = useState(initialType);
  const [savedLocation, setSavedLocation] = useState(initialLocation);
  const [savedEmail, setSavedEmail] = useState(initialContactEmail);
  const [type, setType] = useState(initialType);
  const [location, setLocation] = useState(initialLocation);
  const [contactEmail, setContactEmail] = useState(initialContactEmail);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const normalizedLocation = location.trim();
  const normalizedEmail = contactEmail.trim();
  const unchanged =
    type === savedType &&
    normalizedLocation === savedLocation &&
    normalizedEmail === savedEmail;

  async function handleSave() {
    if (unchanged) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/instructor/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingLocationType: type,
          meetingLocation: normalizedLocation,
          contactEmail: normalizedEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save meeting details');
      setSavedType(data.meetingLocationType);
      setSavedLocation(data.meetingLocation ?? '');
      setSavedEmail(data.contactEmail ?? '');
      setType(data.meetingLocationType);
      setLocation(data.meetingLocation ?? '');
      setContactEmail(data.contactEmail ?? '');
      setFeedback({ kind: 'ok', text: 'Meeting details saved.' });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to save meeting details',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-gray-200 rounded-lg bg-white px-5 py-4">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div className="flex items-start gap-3 md:w-72 shrink-0">
          <MapPin className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Meeting details</h2>
            <p className="text-sm text-gray-500">
              Where students join and how they can reach you. Optional — shown on new bookings.
            </p>
          </div>
        </div>

        <form
          className="flex-1 min-w-0 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div>
            <label htmlFor="meeting-location-type" className="block text-sm font-medium text-gray-700 mb-1">
              Location type
            </label>
            <select
              id="meeting-location-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as MeetingLocationType);
                setFeedback(null);
              }}
              className="w-full sm:max-w-xs px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
            >
              {MEETING_LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEETING_LOCATION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="meeting-location" className="block text-sm font-medium text-gray-700 mb-1">
              Location details
            </label>
            <input
              id="meeting-location"
              type="text"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setFeedback(null);
              }}
              maxLength={MEETING_LOCATION_MAX_LENGTH}
              placeholder={MEETING_LOCATION_PLACEHOLDERS[type]}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
            />
          </div>

          <div>
            <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1">
              Preferred contact email
            </label>
            <input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => {
                setContactEmail(e.target.value);
                setFeedback(null);
              }}
              placeholder="students@example.com"
              className="w-full sm:max-w-md px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <p className="text-xs text-gray-500 mt-1.5">
              Shown to students. Can differ from the Google Calendar connection email used for your
              notifications.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={unchanged || saving}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-electric-blue text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </button>
            {feedback && (
              <span
                className={`text-sm font-medium ${
                  feedback.kind === 'ok' ? 'text-green-700' : 'text-red-600'
                }`}
              >
                {feedback.text}
              </span>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
