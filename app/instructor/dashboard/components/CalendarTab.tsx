"use client"

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  DAY_LABELS,
  DEFAULT_AVAILABILITY_TIMEZONE,
  MEETING_DURATION_MINUTES,
  MEETING_MAX_HEADCOUNT,
} from '@/app/lib/calendar/constants';
import { formatEndHhMm } from '@/app/lib/calendar/ics';

type WindowRow = {
  key: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type SlotPreview = {
  start: string;
  end: string;
  dayOfWeek: number;
  localDate: string;
  localTime: string;
  weeklyKey: string;
  timezone: string;
};

type CalendarStatus = {
  googleConfigured: boolean;
  canEdit: boolean;
  meetingDurationMinutes: number;
  meetingMaxHeadcount: number;
  defaultTimezone: string;
  google: { connected: boolean; email?: string | null; connectedAt?: string };
  windows: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    timezone: string;
  }>;
};

function newRow(dayOfWeek = 3): WindowRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dayOfWeek,
    startTime: '10:00',
    endTime: '23:00',
  };
}

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
  const [rows, setRows] = useState<WindowRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotPreview, setSlotPreview] = useState<SlotPreview[]>([]);
  const [uniqueWeekly, setUniqueWeekly] = useState<SlotPreview[]>([]);
  const [slotCount, setSlotCount] = useState(0);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const res = await fetch('/api/instructor/calendar/slots?days=14');
      if (!res.ok) {
        throw new Error('Failed to load slots');
      }
      const data = await res.json();
      setSlotPreview((data.slots as SlotPreview[]).slice(0, 24));
      setUniqueWeekly((data.uniqueWeekly as SlotPreview[]) || []);
      setSlotCount(typeof data.slotCount === 'number' ? data.slotCount : 0);
    } catch (err) {
      console.error(err);
      setSlotPreview([]);
      setUniqueWeekly([]);
      setSlotCount(0);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

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
      setRows(
        data.windows.length
          ? data.windows.map((w) => ({
              key: w.id,
              dayOfWeek: w.dayOfWeek,
              startTime: w.startTime,
              endTime: w.endTime,
            }))
          : []
      );
      await loadSlots();
    } catch (err) {
      console.error(err);
      setError('Could not load calendar settings.');
    } finally {
      setLoading(false);
    }
  }, [loadSlots]);

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
  const canEdit = status?.canEdit ?? false;

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/instructor/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone,
          windows: rows.map(({ dayOfWeek, startTime, endTime }) => ({
            dayOfWeek,
            startTime,
            endTime,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }
      setRows(
        (data.windows as CalendarStatus['windows']).map((w) => ({
          key: w.id,
          dayOfWeek: w.dayOfWeek,
          startTime: w.startTime,
          endTime: w.endTime,
        }))
      );
      setMessage('Availability saved.');
      await loadSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!canEdit) return;
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

  return (
    <div className="space-y-8 max-w-3xl">
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

      <section className="border border-gray-200 rounded-lg bg-white p-6">
        <div className="flex items-start gap-3 mb-4">
          <Calendar className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Google Calendar</h2>
            <p className="text-sm text-gray-500 mt-1">
              Connect so OfferInsight can create and update monthly 1:1 events on your calendar.
              Students get an email invite (.ics); they do not need Google access.
            </p>
          </div>
        </div>

        {!status?.googleConfigured && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
            Add <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> to{' '}
            <code className="font-mono text-xs">.env.local</code>, and set the OAuth redirect URI to{' '}
            <code className="font-mono text-xs break-all">
              {'{NEXTAUTH_URL}/api/instructor/calendar/google/callback'}
            </code>
            . You can still save availability below without connecting Google.
          </p>
        )}

        {status?.google.connected ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="text-sm text-gray-700">
              Connected as{' '}
              <span className="font-semibold text-gray-900">
                {status.google.email || 'Google account'}
              </span>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            )}
          </div>
        ) : (
          <div>
            {canEdit ? (
              <a
                href="/api/instructor/calendar/google/connect"
                className={`inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  status?.googleConfigured
                    ? 'bg-electric-blue text-white hover:opacity-90'
                    : 'bg-gray-200 text-gray-500 pointer-events-none'
                }`}
                aria-disabled={!status?.googleConfigured}
              >
                Connect Google Calendar
              </a>
            ) : (
              <p className="text-sm text-gray-500">Read-only instructors cannot connect Google.</p>
            )}
          </div>
        )}
      </section>

      <section className="border border-gray-200 rounded-lg bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Weekly availability</h2>
        <p className="text-sm text-gray-500 mb-4">
          Students book {status?.meetingDurationMinutes ?? MEETING_DURATION_MINUTES}-minute
          exclusive slots (max {status?.meetingMaxHeadcount ?? MEETING_MAX_HEADCOUNT} student per
          slot) inside these windows. Times use{' '}
          <span className="font-medium text-gray-700">{timezone.replace(/_/g, ' ')}</span>.
        </p>

        <div className="space-y-3 mb-4">
          {rows.length === 0 && (
            <p className="text-sm text-gray-400 py-2">
              No windows yet. Add days/times when you are available for monthly meetings.
            </p>
          )}
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-col sm:flex-row gap-2 sm:items-center border border-gray-100 rounded-lg p-3 bg-gray-50"
            >
              <select
                value={row.dayOfWeek}
                disabled={!canEdit}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.key === row.key
                        ? { ...r, dayOfWeek: Number(e.target.value) }
                        : r
                    )
                  )
                }
                className="sm:w-40 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
              >
                {DAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={row.startTime}
                disabled={!canEdit}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.key === row.key ? { ...r, startTime: e.target.value } : r
                    )
                  )
                }
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
              <span className="text-gray-400 text-sm hidden sm:inline">to</span>
              <input
                type="time"
                value={row.endTime}
                disabled={!canEdit}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.key === row.key ? { ...r, endTime: e.target.value } : r
                    )
                  )
                }
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors sm:ml-auto"
                  aria-label="Remove window"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, newRow()])}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              Add window
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
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
        )}
      </section>

      <section className="border border-gray-200 rounded-lg bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Bookable slots preview</h2>
        <p className="text-sm text-gray-500 mb-4">
          Next 14 days of {status?.meetingDurationMinutes ?? MEETING_DURATION_MINUTES}-minute
          exclusive openings from your saved windows ({slotCount} total). Standing monthly times:{' '}
          {uniqueWeekly.length}. Student bookings remove those times from this list.
        </p>

        {slotsLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating slots…
          </div>
        ) : slotPreview.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">
            No upcoming slots. Save at least one availability window first.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
            {slotPreview.map((slot) => (
              <div
                key={`${slot.start}-${slot.weeklyKey}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="text-gray-900 font-medium">
                  {DAY_LABELS[slot.dayOfWeek]} {slot.localDate}
                </span>
                <span className="text-gray-600">
                  {slot.localTime}–{formatEndHhMm(slot.localTime, status?.meetingDurationMinutes ?? MEETING_DURATION_MINUTES)}{' '}
                  <span className="text-gray-400">({timezone.replace(/_/g, ' ')})</span>
                </span>
                <span className="font-mono text-xs text-gray-400">{slot.weeklyKey}</span>
              </div>
            ))}
            {slotCount > slotPreview.length && (
              <div className="px-3 py-2 text-xs text-gray-400">
                Showing first {slotPreview.length} of {slotCount}…
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
