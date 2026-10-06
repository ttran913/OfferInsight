"use client"

import { useCallback, useEffect, useState } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import {
  DAY_LABELS,
  MEETING_DURATION_MINUTES,
} from '@/app/lib/calendar/constants';
import { formatEndHhMm } from '@/app/lib/calendar/ics';

export type MeetingSummary = {
  id: string;
  weeklyKey: string;
  dayOfWeek: number;
  dayLabel: string;
  scheduleLabel: string;
  localTime: string;
  timezone: string;
  firstOccurrence: string;
  nextOccurrence?: string | null;
  nextOccurrenceLabel?: string | null;
};

type SlotOption = {
  start: string;
  end: string;
  dayOfWeek: number;
  localDate: string;
  localTime: string;
  weeklyKey: string;
  timezone: string;
};

type MonthlyMeetingSchedulerProps = {
  /** After successful save (e.g. navigate to dashboard on onboarding). */
  onSaved?: (result: {
    meeting: MeetingSummary;
    onboardingProgress: number;
    emailSent: boolean;
    emailError: string | null;
    googleSynced?: boolean;
    googleError?: string | null;
  }) => void;
  /** Show skip link (onboarding only). */
  showSkip?: boolean;
  onSkip?: () => void;
  /** Start collapsed; slot picker only opens after the student chooses to change. */
  collapsible?: boolean;
};

export default function MonthlyMeetingScheduler({
  onSaved,
  showSkip,
  onSkip,
  collapsible = false,
}: MonthlyMeetingSchedulerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);
  const [instructorName, setInstructorName] = useState('Utsab');
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [meeting, setMeeting] = useState<MeetingSummary | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meetingRes, slotsRes] = await Promise.all([
        fetch('/api/calendar/meeting'),
        fetch('/api/calendar/slots'),
      ]);

      if (!meetingRes.ok || !slotsRes.ok) {
        const meetingErr = meetingRes.ok ? null : await meetingRes.text().catch(() => '');
        const slotsErr = slotsRes.ok ? null : await slotsRes.text().catch(() => '');
        console.error('Scheduling load failed', {
          meetingStatus: meetingRes.status,
          slotsStatus: slotsRes.status,
          meetingErr,
          slotsErr,
        });
        throw new Error('Failed to load scheduling data');
      }

      const meetingData = await meetingRes.json();
      const slotsData = await slotsRes.json();

      setInstructorName(meetingData.instructorName || slotsData.instructorName || 'Utsab');
      setMeeting(meetingData.meeting ?? null);
      setSelectedKey(meetingData.meeting?.weeklyKey ?? null);
      setSlots((slotsData.slots as SlotOption[]) || []);
      setEmptyMessage(slotsData.message || null);
    } catch (err) {
      console.error(err);
      setError('Could not load available meeting times.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!selectedKey) {
      setError('Select a monthly meeting time first.');
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    const wasReschedule = Boolean(meeting);
    try {
      const res = await fetch('/api/calendar/meeting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyKey: selectedKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save schedule');
      }
      setMeeting(data.meeting);
      const emailNote = data.emailSent
        ? ' Calendar invite emailed.'
        : data.emailError
          ? ` (Invite email failed: ${data.emailError})`
          : '';
      const googleNote = data.googleSynced
        ? ' Added to instructor Google Calendar.'
        : data.googleError && data.googleError !== 'Instructor Google Calendar is not connected.'
          ? ` (Google Calendar: ${friendlyGoogleError(data.googleError)})`
          : '';
      setMessage(
        `${wasReschedule ? 'Meeting updated.' : 'Meeting scheduled.'}${emailNote}${googleNote}`
      );
      onSaved?.({
        meeting: data.meeting,
        onboardingProgress: data.onboardingProgress,
        emailSent: data.emailSent,
        emailError: data.emailError,
        googleSynced: data.googleSynced,
        googleError: data.googleError,
      });
      if (collapsible) setExpanded(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }

  function handleExpand() {
    setMessage(null);
    setError(null);
    setExpanded(true);
  }

  function handleCancel() {
    setSelectedKey(meeting?.weeklyKey ?? null);
    setError(null);
    setExpanded(false);
  }

  const selectionUnchanged = Boolean(meeting) && selectedKey === meeting?.weeklyKey;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-6">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading meeting times…
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <Calendar className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Monthly meeting with {instructorName}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Pick a standing {MEETING_DURATION_MINUTES}-minute time (same weekday each month).
            We&apos;ll email you a calendar invite (.ics).
          </p>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            error
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-green-300 bg-green-50 text-green-800'
          }`}
        >
          {error || message}
        </div>
      )}

      {meeting ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <div>
            Current schedule:{' '}
            <span className="font-semibold text-gray-900">
              {meeting.scheduleLabel}
            </span>{' '}
            <span className="text-gray-400">
              ({meeting.timezone.replace(/_/g, ' ')})
            </span>
          </div>
          {meeting.nextOccurrenceLabel && (
            <div className="mt-1.5 text-gray-900">
              Next meeting:{' '}
              <span className="font-semibold">{meeting.nextOccurrenceLabel}</span>
            </div>
          )}
        </div>
      ) : (
        collapsible && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            No meeting scheduled yet with {instructorName}
          </div>
        )
      )}

      {!expanded ? (
        <button
          type="button"
          onClick={handleExpand}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold border border-electric-blue text-electric-blue hover:bg-blue-50"
        >
          {meeting ? 'Change schedule' : 'Schedule meeting'}
        </button>
      ) : (
        <>
          {slots.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              {emptyMessage ||
                `No open times right now. Check back after ${instructorName} updates availability.`}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 max-h-80 overflow-y-auto">
              {slots.map((slot) => {
                const selected = selectedKey === slot.weeklyKey;
                return (
                  <button
                    key={slot.weeklyKey}
                    type="button"
                    onClick={() => setSelectedKey(slot.weeklyKey)}
                    className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                      selected
                        ? 'border-electric-blue bg-blue-50 ring-2 ring-electric-blue/30'
                        : 'border-gray-200 bg-white hover:border-electric-blue'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">
                      {DAY_LABELS[slot.dayOfWeek]}s · {slot.localTime}–
                      {formatEndHhMm(slot.localTime, MEETING_DURATION_MINUTES)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Next: {slot.localDate} ({slot.timezone.replace(/_/g, ' ')})
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedKey || slots.length === 0 || selectionUnchanged}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold bg-electric-blue text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save schedule
            </button>
            {collapsible && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="px-5 py-2.5 rounded-lg font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            {showSkip && onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="text-sm text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline"
              >
                Skip for now
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function friendlyGoogleError(message: string): string {
  if (/insufficient authentication scopes/i.test(message)) {
    return 'missing calendar permission — on the instructor Calendar tab, Disconnect Google, then Connect again and allow calendar access';
  }
  return message;
}
