"use client"

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import {
  DAY_LABELS,
  DEFAULT_AVAILABILITY_TIMEZONE,
  INSTRUCTOR_DISPLAY_NAME_FALLBACK,
  MEETING_DURATION_MINUTES,
} from '@/app/lib/calendar/constants';
import { formatEndHhMm, nthWeekdayForLocalDate } from '@/app/lib/calendar/ics';
import { formatTime12, nthOrdinalLabel } from '@/app/lib/calendar/labels';
import { buildMonthGrid, localDateKey } from '@/app/lib/calendar/month-grid';
import { followingMonthlyLocalDate } from '@/app/lib/calendar/next-occurrence';
import { ModalOverlay, ModalPanel } from '@/app/dashboard/components/shared';

export type MeetingSummary = {
  id: string;
  weeklyKey: string;
  dayOfWeek: number;
  dayLabel: string;
  nthWeekday: number;
  scheduleLabel: string;
  localTime: string;
  timezone: string;
  firstOccurrence: string;
  nextOccurrence?: string | null;
  nextOccurrenceDate?: string | null;
  nextOccurrenceLabel?: string | null;
};

type BookableDayOption = {
  localDate: string;
  dayOfWeek: number;
  nthWeekday: number;
  times: string[];
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
  /** Start collapsed; the calendar only opens after the student chooses to change. */
  collapsible?: boolean;
};

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatDateKey(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  );
}

function longDate(dateKey: string): string {
  return formatDateKey(dateKey, { weekday: 'long', month: 'long', day: 'numeric' });
}

function timeRange(localTime: string): string {
  return `${formatTime12(localTime)} – ${formatTime12(formatEndHhMm(localTime, MEETING_DURATION_MINUTES))}`;
}

function BookingMonthGrid({
  year,
  month,
  todayKey,
  selectedDate,
  meetingDate,
  dayByDate,
  onSelect,
}: {
  year: number;
  month: number;
  todayKey: string;
  selectedDate: string | null;
  meetingDate: string | null;
  dayByDate: Map<string, BookableDayOption>;
  onSelect: (dateKey: string) => void;
}) {
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const title = formatDateKey(`${year}-${String(month).padStart(2, '0')}-01`, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400 mb-1">
        {WEEKDAY_INITIALS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((cell) => {
          if (!cell.inMonth) return <div key={cell.dateKey} className="h-10" />;

          const open = dayByDate.has(cell.dateKey);
          const selected = cell.dateKey === selectedDate;
          const isToday = cell.dateKey === todayKey;
          const hasMeeting = cell.dateKey === meetingDate;
          const dot = hasMeeting && (
            <span
              className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full ${
                selected ? 'bg-white' : 'bg-electric-blue'
              }`}
            />
          );

          if (!open) {
            return (
              <div
                key={cell.dateKey}
                className={`relative h-10 flex items-center justify-center rounded-md text-sm ${
                  cell.dateKey < todayKey ? 'text-gray-300' : 'text-gray-400'
                } ${isToday ? 'ring-1 ring-gray-300' : ''}`}
              >
                {cell.day}
                {dot}
              </div>
            );
          }

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => onSelect(cell.dateKey)}
              aria-pressed={selected}
              aria-label={`${longDate(cell.dateKey)}, open`}
              className={`relative h-10 flex items-center justify-center rounded-md text-sm font-semibold transition-colors ${
                selected
                  ? 'bg-green-600 text-white'
                  : 'bg-green-50 text-green-800 border border-green-200 hover:bg-green-100'
              } ${isToday && !selected ? 'ring-2 ring-green-400' : ''}`}
            >
              {cell.day}
              {dot}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MonthlyMeetingScheduler({
  onSaved,
  showSkip,
  onSkip,
  collapsible = false,
}: MonthlyMeetingSchedulerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);
  const [instructorName, setInstructorName] = useState(INSTRUCTOR_DISPLAY_NAME_FALLBACK);
  const [timezone, setTimezone] = useState(DEFAULT_AVAILABILITY_TIMEZONE);
  const [days, setDays] = useState<BookableDayOption[]>([]);
  const [meeting, setMeeting] = useState<MeetingSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

      setInstructorName(
        meetingData.instructorName || slotsData.instructorName || INSTRUCTOR_DISPLAY_NAME_FALLBACK
      );
      setMeeting(meetingData.meeting ?? null);
      setTimezone(slotsData.timezone || DEFAULT_AVAILABILITY_TIMEZONE);
      setDays((slotsData.days as BookableDayOption[]) || []);
      setEmptyMessage(slotsData.message || null);
      setSelectedDate(null);
      setSelectedTime(null);
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

  const dayByDate = useMemo(() => new Map(days.map((d) => [d.localDate, d])), [days]);
  const todayKey = localDateKey(new Date(), timezone);
  const months = useMemo(() => {
    const [y, m] = todayKey.split('-').map(Number);
    return [
      { year: y, month: m },
      { year: m === 12 ? y + 1 : y, month: m === 12 ? 1 : m + 1 },
    ];
  }, [todayKey]);

  const selectedDay = selectedDate ? dayByDate.get(selectedDate) ?? null : null;
  const followingDate = selectedDate ? followingMonthlyLocalDate(selectedDate) : null;
  const selectionUnchanged =
    Boolean(meeting && selectedDate && selectedTime) &&
    meeting!.dayOfWeek === selectedDay?.dayOfWeek &&
    meeting!.nthWeekday === nthWeekdayForLocalDate(selectedDate!) &&
    meeting!.localTime === selectedTime;

  async function handleSave() {
    if (!selectedDate || !selectedTime) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const wasReschedule = Boolean(meeting);
    try {
      const res = await fetch('/api/calendar/meeting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localDate: selectedDate, localTime: selectedTime }),
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
      setConfirmOpen(false);
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
      setConfirmOpen(false);
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
    setSelectedDate(null);
    setSelectedTime(null);
    setError(null);
    setExpanded(false);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-6">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading meeting times…
      </div>
    );
  }

  const timezoneLabel = timezone.replace(/_/g, ' ');
  const selectedNth = selectedDate ? nthOrdinalLabel(nthWeekdayForLocalDate(selectedDate)) : null;
  const selectedWeekday = selectedDay ? DAY_LABELS[selectedDay.dayOfWeek] : null;

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <Calendar className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Monthly meeting with {instructorName}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Pick a day for your first {MEETING_DURATION_MINUTES}-minute meeting. It repeats on the
            same week and weekday every month (e.g. the 2nd Wednesday). We&apos;ll email you a
            calendar invite (.ics).
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
            <span className="font-semibold text-gray-900">{meeting.scheduleLabel}</span>{' '}
            <span className="text-gray-400">({meeting.timezone.replace(/_/g, ' ')})</span>
          </div>
          {meeting.nextOccurrenceLabel && (
            <div className="mt-1.5 text-gray-900">
              Next meeting: <span className="font-semibold">{meeting.nextOccurrenceLabel}</span>
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
          {days.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              {emptyMessage ||
                `No open times right now. Check back after ${instructorName} updates availability.`}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {months.map(({ year, month }) => (
                  <BookingMonthGrid
                    key={`${year}-${month}`}
                    year={year}
                    month={month}
                    todayKey={todayKey}
                    selectedDate={selectedDate}
                    meetingDate={meeting?.nextOccurrenceDate ?? null}
                    dayByDate={dayByDate}
                    onSelect={(dateKey) => {
                      setSelectedDate(dateKey);
                      setSelectedTime(null);
                    }}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-green-50 border border-green-200" />
                  Open
                </span>
                {meeting?.nextOccurrenceDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-electric-blue" />
                    Your next meeting
                  </span>
                )}
                <span>All times {timezoneLabel}</span>
              </div>

              <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                {selectedDay && selectedDate ? (
                  <>
                    <div className="font-semibold text-gray-900">{longDate(selectedDate)}</div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Repeats on the{' '}
                      <span className="font-semibold text-gray-900">
                        {selectedNth} {selectedWeekday}
                      </span>{' '}
                      of every month.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                      {selectedDay.times.map((t) => {
                        const selected = selectedTime === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setSelectedTime(t)}
                            aria-pressed={selected}
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                              selected
                                ? 'border-electric-blue bg-electric-blue text-white'
                                : 'border-gray-200 bg-white text-gray-900 hover:border-electric-blue'
                            }`}
                          >
                            {formatTime12(t)}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Pick a green day to see open times.</p>
                )}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={saving || !selectedTime || selectionUnchanged}
              title={selectionUnchanged ? 'That is already your schedule.' : undefined}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold bg-electric-blue text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
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

      {confirmOpen && selectedDate && selectedTime && selectedDay && (
        <ModalOverlay onClose={() => !saving && setConfirmOpen(false)}>
          <ModalPanel size="md">
            <h3 className="text-lg font-semibold text-gray-900">Confirm your monthly 1:1</h3>
            <p className="text-sm text-gray-500 mt-1">With {instructorName}</p>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Every month</dt>
                <dd className="font-semibold text-gray-900">
                  {selectedNth} {selectedWeekday} · {timeRange(selectedTime)}{' '}
                  <span className="font-normal text-gray-400">({timezoneLabel})</span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">First meeting</dt>
                <dd className="font-semibold text-gray-900">{longDate(selectedDate)}</dd>
              </div>
              {followingDate && (
                <div>
                  <dt className="text-gray-500">Following meeting</dt>
                  <dd className="font-semibold text-gray-900">{longDate(followingDate)}</dd>
                </div>
              )}
            </dl>

            {meeting && (
              <p className="mt-4 text-xs text-gray-500">
                This replaces your current schedule ({meeting.scheduleLabel}).
              </p>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-electric-blue text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
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
