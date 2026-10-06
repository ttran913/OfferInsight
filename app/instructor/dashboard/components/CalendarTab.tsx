"use client"

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Calendar, CalendarCheck, Clock, Loader2 } from 'lucide-react';
import {
  BOOKING_CANDIDATE_DAYS,
  DEFAULT_AVAILABILITY_TIMEZONE,
  MEETING_DURATION_MINUTES,
} from '@/app/lib/calendar/constants';
import { resolveStandingTimes, type BusyInterval } from '@/app/lib/calendar/conflicts';
import { generateAvailableSlots } from '@/app/lib/calendar/slots';
import AvailabilityEditor from './calendar/AvailabilityEditor';
import DisplayNameCard from './calendar/DisplayNameCard';
import MonthCalendar from './calendar/MonthCalendar';
import StandingWeekView from './calendar/StandingWeekView';
import {
  daysToWindows,
  rangeErrors,
  weeklyKeysForWindows,
  windowsSignature,
  windowsToDays,
  type Booking,
  type DayAvailability,
  type SavedWindow,
} from './calendar/availability-model';

type CalendarStatus = {
  googleConfigured: boolean;
  canManageDefault: boolean;
  displayName: string;
  isDefaultScheduler: boolean;
  defaultInstructorLabel: string | null;
  isDefaultInstructor: boolean;
  meetingDurationMinutes: number;
  meetingMaxHeadcount: number;
  defaultTimezone: string;
  google: { connected: boolean; email?: string | null; connectedAt?: string };
  windows: SavedWindow[];
  bookings: Booking[];
  busy:
    | { status: 'ok'; intervals: BusyInterval[] }
    | { status: 'not_connected' }
    | { status: 'error' };
};

const ERROR_MESSAGES: Record<string, string> = {
  not_signed_in: 'Sign in as instructor again, then reconnect Google.',
  missing_code: 'Google did not return an authorization code.',
  invalid_state: 'OAuth state was invalid. Try connecting again.',
  no_access_token: 'Google did not return an access token.',
  no_refresh_token:
    'Google did not return a refresh token. Revoke app access in Google Account settings, then connect again.',
  callback_failed: 'Google connection failed. Try again.',
  access_denied: 'Google access was denied.',
};

export default function CalendarTab() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [savedDays, setSavedDays] = useState<DayAvailability[]>(() => windowsToDays([]));
  const [days, setDays] = useState<DayAvailability[]>(() => windowsToDays([]));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/instructor/calendar');
      if (!res.ok) {
        throw new Error('Failed to load calendar settings');
      }
      const data = (await res.json()) as CalendarStatus;
      setStatus(data);
      const loaded = windowsToDays(data.windows);
      setSavedDays(loaded);
      setDays(loaded);
    } catch (err) {
      console.error(err);
      setError('Could not load calendar settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const connected = searchParams.get('calendarConnected');
    const calendarError = searchParams.get('calendarError');
    if (connected) {
      setMessage('Google Calendar connected.');
    }
    if (calendarError) {
      setError(ERROR_MESSAGES[calendarError] || `Google connect error: ${calendarError}`);
    }
  }, [searchParams]);

  const timezone = status?.defaultTimezone ?? DEFAULT_AVAILABILITY_TIMEZONE;
  const duration = status?.meetingDurationMinutes ?? MEETING_DURATION_MINUTES;
  const bookings = useMemo(() => status?.bookings ?? [], [status]);

  const draftWindows = useMemo(() => daysToWindows(days), [days]);
  const isDirty = windowsSignature(draftWindows) !== windowsSignature(daysToWindows(savedDays));
  const hasErrors = days.some((d) => Object.keys(rangeErrors(d)).length > 0);
  const resolution = useMemo(() => {
    if (status?.busy.status !== 'ok') return null;
    return resolveStandingTimes({
      slots: generateAvailableSlots({
        windows: draftWindows,
        days: BOOKING_CANDIDATE_DAYS,
        timezone,
        durationMinutes: duration,
      }),
      busy: status.busy.intervals,
      durationMinutes: duration,
    });
  }, [status, draftWindows, timezone, duration]);
  const bookingsOutsideDraft = useMemo(() => {
    const keys = weeklyKeysForWindows(draftWindows, duration);
    return bookings.filter((b) => !keys.has(b.weeklyKey));
  }, [bookings, draftWindows, duration]);

  async function handleSave() {
    if (!isDirty || hasErrors) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/instructor/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, windows: draftWindows }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }
      const saved = windowsToDays(data.windows as SavedWindow[]);
      setSavedDays(saved);
      setDays(saved);
      setMessage('Availability saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/instructor/calendar/google/disconnect', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to disconnect');
      }
      setMessage('Google Calendar disconnected.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-8">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading calendar settings…
      </div>
    );
  }

  const timezoneLabel = timezone.replace(/_/g, ' ');

  return (
    <div className="space-y-6">
      {(message || error) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            error
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-green-300 bg-green-50 text-green-800'
          }`}
        >
          {error || message}
        </div>
      )}

      <DisplayNameCard
        initialName={status?.displayName ?? ''}
        canManageDefault={status?.canManageDefault ?? false}
        initialDefault={{
          isDefaultScheduler: status?.isDefaultScheduler ?? false,
          defaultInstructorLabel: status?.defaultInstructorLabel ?? null,
          isDefaultInstructor: status?.isDefaultInstructor ?? false,
        }}
      />

      <section className="border border-gray-200 rounded-lg bg-white px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Calendar className="w-6 h-6 text-electric-blue shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Google Calendar</h2>
                {status?.google.connected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    Not connected
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 truncate">
                {status?.google.connected
                  ? `Monthly 1:1s are added to ${status.google.email || 'your Google account'}.`
                  : 'Connect so student bookings show up on your calendar automatically.'}
              </p>
            </div>
          </div>

          {status?.google.connected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="shrink-0 px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <a
              href="/api/instructor/calendar/google/connect"
              className={`shrink-0 inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                status?.googleConfigured
                  ? 'bg-electric-blue text-white hover:opacity-90'
                  : 'bg-gray-200 text-gray-500 pointer-events-none'
              }`}
              aria-disabled={!status?.googleConfigured}
            >
              Connect Google Calendar
            </a>
          )}
        </div>

        {!status?.googleConfigured && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mt-4">
            Add <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> to{' '}
            <code className="font-mono text-xs">.env.local</code>, and set the OAuth redirect URI to{' '}
            <code className="font-mono text-xs break-all">
              {'{NEXTAUTH_URL}/api/instructor/calendar/google/callback'}
            </code>
            . You can still set availability without connecting Google.
          </p>
        )}
      </section>

      {status?.google.connected && <MonthCalendar timezone={timezone} />}

      <section className="border border-gray-200 rounded-lg bg-white">
        <div className="px-5 pt-5 pb-1 flex items-start gap-3">
          <Clock className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Weekly hours</h2>
            <p className="text-sm text-gray-500 mt-1">
              Students pick a {duration}-minute time inside these hours, and it repeats monthly on
              the same weekday. All times are{' '}
              <span className="font-medium text-gray-700">{timezoneLabel}</span>.
            </p>
          </div>
        </div>

        <div className="px-5">
          <AvailabilityEditor
            days={days}
            onChange={setDays}
            durationMinutes={duration}
          />
        </div>

        <div className="sticky bottom-0 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-gray-200 bg-white/95 backdrop-blur px-5 py-3 rounded-b-lg">
          <div className="text-sm">
            {isDirty ? (
              <span className="inline-flex items-center gap-2 text-amber-700 font-medium">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            ) : (
              <span className="text-gray-400">All changes saved</span>
            )}
            {isDirty && bookingsOutsideDraft.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {bookingsOutsideDraft.length === 1
                  ? '1 booked student falls outside these hours.'
                  : `${bookingsOutsideDraft.length} booked students fall outside these hours.`}{' '}
                They keep their meeting until they reschedule.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDays(savedDays)}
              disabled={!isDirty || saving}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || hasErrors || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-electric-blue text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save availability'
              )}
            </button>
          </div>
        </div>
      </section>

      <section className="border border-gray-200 rounded-lg bg-white p-5">
        <div className="flex items-start gap-3 mb-4">
          <CalendarCheck className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-900">Standing week</h2>
              {isDirty && (
                <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  Previewing unsaved changes
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Each time below is one monthly standing slot. Once a student books it, nobody else
              can take that weekday and time. If a Google Calendar event gets in the way, the
              student&apos;s first meeting moves to the next week where three monthly meetings in
              a row are free. Times with no such week are busy and hidden from students. Hover a
              slot for details.
            </p>
          </div>
        </div>
        {status?.busy.status === 'error' && (
          <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Couldn&apos;t read your Google Calendar, so students can currently book times that
            conflict with your other events. Disconnect and reconnect Google above to fix this.
          </p>
        )}
        {status?.busy.status === 'not_connected' && (
          <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4">
            Connect Google Calendar to automatically block times that conflict with your other
            events.
          </p>
        )}
        <StandingWeekView
          windows={draftWindows}
          bookings={bookings}
          resolution={resolution}
          durationMinutes={duration}
          timezone={timezone}
        />
      </section>
    </div>
  );
}
