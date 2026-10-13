"use client"

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CalendarClock, Loader2, Repeat } from 'lucide-react';
import {
  DAY_LABELS,
  DEFAULT_AVAILABILITY_TIMEZONE,
  INSTRUCTOR_DISPLAY_NAME_FALLBACK,
  MEETING_DURATION_MINUTES,
} from '@/app/lib/calendar/constants';
import { formatEndHhMm } from '@/app/lib/calendar/ics';
import { formatTime12, nthOrdinalLabel } from '@/app/lib/calendar/labels';
import { buildMonthGrid, localDateKey } from '@/app/lib/calendar/month-grid';
import { followingMonthlyLocalDate } from '@/app/lib/calendar/next-occurrence';
import { ModalOverlay, ModalPanel } from '@/app/dashboard/components/shared';
import { MUST_BOOK_WARNING_HOURS } from '@/app/lib/must-book';
import MustBookAlert, { type MustBookNotice } from '@/components/must-book-alert';

export type MeetingSummary = {
  dayOfWeek: number;
  nthWeekday: number;
  scheduleLabel: string;
  localTime: string;
  timezone: string;
  nextOccurrenceDate: string | null;
  nextOccurrenceLabel: string | null;
  /** Set when the next meeting was moved one time; the regular date it replaces. */
  movedFrom: { start: string; label: string } | null;
};

type BookableDayOption = {
  localDate: string;
  dayOfWeek: number;
  nthWeekday: number;
  times: string[];
};

type OneTimeOptions = {
  timezone: string;
  original: { start: string; label: string };
  current: { start: string; label: string } | null;
  followingLabel: string | null;
  days: { localDate: string; dayOfWeek: number; times: string[] }[];
};

type Mode = 'closed' | 'choose' | 'regular' | 'once';

type MonthlyMeetingSchedulerProps = {
  /** After successful save (e.g. navigate to dashboard on onboarding). */
  onSaved?: () => void;
  /** Show skip link (onboarding only). */
  showSkip?: boolean;
  onSkip?: () => void;
  skipping?: boolean;
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

/** Calendar months from `startKey`'s month through `endKey`'s month (at least two). */
function monthsCovering(startKey: string, endKey: string): { year: number; month: number }[] {
  let [y, m] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  const months: { year: number; month: number }[] = [];
  while (months.length < 2 || y < ey || (y === ey && m <= em)) {
    months.push({ year: y, month: m });
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
  return months;
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
  dayByDate: ReadonlyMap<string, unknown>;
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

function TimeButtons({
  times,
  selectedTime,
  onSelect,
}: {
  times: string[];
  selectedTime: string | null;
  onSelect: (time: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
      {times.map((t) => {
        const selected = selectedTime === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
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
  );
}

export default function MonthlyMeetingScheduler({
  onSaved,
  showSkip,
  onSkip,
  skipping = false,
  collapsible = false,
}: MonthlyMeetingSchedulerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>(collapsible ? 'closed' : 'regular');
  const [instructorName, setInstructorName] = useState(INSTRUCTOR_DISPLAY_NAME_FALLBACK);
  const [timezone, setTimezone] = useState(DEFAULT_AVAILABILITY_TIMEZONE);
  const [days, setDays] = useState<BookableDayOption[]>([]);
  const [meeting, setMeeting] = useState<MeetingSummary | null>(null);
  const [mustBook, setMustBook] = useState<MustBookNotice | null>(null);
  const [oneTime, setOneTime] = useState<OneTimeOptions | null>(null);
  const [oneTimeLoading, setOneTimeLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
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
      setMustBook(meetingData.mustBook ?? null);
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
  const oneTimeDayByDate = useMemo(
    () => new Map((oneTime?.days ?? []).map((d) => [d.localDate, d])),
    [oneTime]
  );
  const todayKey = localDateKey(new Date(), timezone);
  const regularMonths = useMemo(() => monthsCovering(todayKey, todayKey), [todayKey]);
  const oneTimeMonths = useMemo(
    () => monthsCovering(todayKey, oneTime?.days.at(-1)?.localDate ?? todayKey),
    [todayKey, oneTime]
  );

  const selectedDay = selectedDate ? dayByDate.get(selectedDate) ?? null : null;
  const selectedOneTimeDay = selectedDate ? oneTimeDayByDate.get(selectedDate) ?? null : null;
  const followingDate = selectedDate ? followingMonthlyLocalDate(selectedDate) : null;
  const selectionUnchanged =
    Boolean(meeting && selectedDay && selectedTime) &&
    meeting!.dayOfWeek === selectedDay!.dayOfWeek &&
    meeting!.nthWeekday === selectedDay!.nthWeekday &&
    meeting!.localTime === selectedTime;

  function resetSelection() {
    setSelectedDate(null);
    setSelectedTime(null);
  }

  function openMode(next: Mode) {
    setMessage(null);
    setError(null);
    resetSelection();
    setMode(next);
    if (next === 'once') loadOneTime();
  }

  async function loadOneTime() {
    setOneTimeLoading(true);
    setOneTime(null);
    try {
      const res = await fetch('/api/calendar/meeting/move');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load open times');
      setOneTime(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load open times');
    } finally {
      setOneTimeLoading(false);
    }
  }

  function closePicker() {
    resetSelection();
    setError(null);
    setMode(collapsible ? 'closed' : 'regular');
  }

  async function handleSaveRegular() {
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
        `${wasReschedule ? 'Regular schedule updated.' : 'Meeting scheduled.'}${emailNote}${googleNote}`
      );
      setConfirmOpen(false);
      onSaved?.();
      if (collapsible) setMode('closed');
      await load();
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOneTime() {
    if (!selectedDate || !selectedTime) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/calendar/meeting/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localDate: selectedDate, localTime: selectedTime }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to move meeting');
      setMeeting(data.meeting);
      setMessage(
        'Meeting moved, just this once. Your regular schedule is unchanged. We emailed you an updated calendar invite.'
      );
      setConfirmOpen(false);
      resetSelection();
      setMode(collapsible ? 'closed' : 'regular');
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : 'Failed to move meeting');
    } finally {
      setSaving(false);
    }
  }

  async function handleUndoMove() {
    setUndoing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/calendar/meeting/move', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to undo');
      setMeeting(data.meeting);
      setMessage('Your meeting is back at its regular time. We emailed you an updated calendar invite.');
      if (mode === 'once') closePicker();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo');
    } finally {
      setUndoing(false);
    }
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
  const selectedNth = selectedDay ? nthOrdinalLabel(selectedDay.nthWeekday) : null;
  const selectedWeekday = selectedDay ? DAY_LABELS[selectedDay.dayOfWeek] : null;
  const pickerOpen = mode === 'regular' || mode === 'once';
  const regularLabel = meeting ? meeting.scheduleLabel : null;

  const legend = (
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
  );

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <Calendar className="w-6 h-6 text-electric-blue shrink-0 mt-0.5" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Monthly meeting with {instructorName}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {meeting
              ? `Your ${MEETING_DURATION_MINUTES}-minute 1:1 is required every month. If you can't make a meeting, reschedule it — just that one, or your regular schedule going forward.`
              : `Pick a day for your first ${MEETING_DURATION_MINUTES}-minute meeting. It repeats on the same week and weekday every month (e.g. the 2nd Wednesday). We'll email you a calendar invite (.ics).`}
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

      {mustBook && !meeting && (
        <div className="mb-4">
          <MustBookAlert notice={mustBook} />
        </div>
      )}

      {meeting ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <div>
            Regular schedule:{' '}
            <span className="font-semibold text-gray-900">{meeting.scheduleLabel}</span>{' '}
            <span className="text-gray-400">({meeting.timezone.replace(/_/g, ' ')})</span>
          </div>
          {meeting.nextOccurrenceLabel && (
            <div className="mt-1.5 text-gray-900">
              Next meeting: <span className="font-semibold">{meeting.nextOccurrenceLabel}</span>
              {meeting.movedFrom && (
                <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  One-time change
                </span>
              )}
            </div>
          )}
          {meeting.movedFrom && (
            <div className="mt-1 text-gray-600">
              Moved from <span className="line-through">{meeting.movedFrom.label}</span>
              {' · '}
              <button
                type="button"
                onClick={() => openMode('once')}
                disabled={undoing}
                className="font-semibold text-electric-blue hover:underline disabled:opacity-50"
              >
                Change it again
              </button>
              {' · '}
              <button
                type="button"
                onClick={handleUndoMove}
                disabled={undoing}
                className="font-semibold text-electric-blue hover:underline disabled:opacity-50"
              >
                {undoing ? 'Undoing…' : 'Undo'}
              </button>
            </div>
          )}
        </div>
      ) : (
        collapsible &&
        !mustBook && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You don&apos;t have a monthly 1:1 scheduled with {instructorName}. Monthly 1:1s are{' '}
            <span className="font-semibold">mandatory</span> for everyone in the Resume Book.
          </div>
        )
      )}

      {mode === 'closed' && (
        <button
          type="button"
          onClick={() => openMode(meeting ? 'choose' : 'regular')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold border border-electric-blue text-electric-blue hover:bg-blue-50"
        >
          {meeting ? 'Reschedule' : 'Schedule meeting'}
        </button>
      )}

      {mode === 'choose' && meeting && (
        <div>
          <h3 className="text-base font-semibold text-gray-900">What would you like to change?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <button
              type="button"
              onClick={() => openMode('once')}
              disabled={!meeting.nextOccurrenceLabel}
              className="text-left rounded-lg border-2 border-gray-200 bg-white p-4 hover:border-electric-blue disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <CalendarClock className="w-5 h-5 text-electric-blue" />
                Just this once
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Move only your next meeting
                {meeting.nextOccurrenceLabel && (
                  <>
                    {' '}
                    (<span className="font-semibold text-gray-900">{meeting.nextOccurrenceLabel}</span>)
                  </>
                )}
                .
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Your regular schedule, <span className="font-semibold text-gray-900">{regularLabel}</span>,
                stays the same for every meeting after that.
              </p>
            </button>
            <button
              type="button"
              onClick={() => openMode('regular')}
              className="text-left rounded-lg border-2 border-gray-200 bg-white p-4 hover:border-electric-blue"
            >
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <Repeat className="w-5 h-5 text-electric-blue" />
                Change my regular schedule
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Pick a new day and time for <span className="font-semibold text-gray-900">every</span>{' '}
                meeting from now on, including your next one.
              </p>
              <p className="text-sm text-gray-600 mt-1">
                This replaces <span className="font-semibold text-gray-900">{regularLabel}</span>.
              </p>
            </button>
          </div>
          <div className="pt-4">
            <button
              type="button"
              onClick={closePicker}
              className="px-5 py-2.5 rounded-lg font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'regular' && meeting && (
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Repeat className="w-4 h-4 text-electric-blue" />
          Changing your regular schedule (every meeting from now on)
        </div>
      )}

      {mode === 'regular' &&
        (days.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            {emptyMessage ||
              `No open times right now. Check back after ${instructorName} updates availability.`}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {regularMonths.map(({ year, month }) => (
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
            {legend}

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
                  <TimeButtons
                    times={selectedDay.times}
                    selectedTime={selectedTime}
                    onSelect={setSelectedTime}
                  />
                </>
              ) : (
                <p className="text-sm text-gray-500">Pick a green day to see open times.</p>
              )}
            </div>
          </>
        ))}

      {mode === 'once' && (
        <>
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <CalendarClock className="w-4 h-4" />
              Moving one meeting, just this once
            </div>
            {oneTime && (
              <p className="mt-1">
                Pick a new time for your{' '}
                <span className="font-semibold">{oneTime.original.label}</span> meeting
                {oneTime.current && (
                  <> (currently moved to <span className="font-semibold">{oneTime.current.label}</span>)</>
                )}
                . Your regular schedule ({regularLabel}) doesn&apos;t change
                {oneTime.followingLabel && (
                  <>
                    {' '}
                    — you&apos;re back on it{' '}
                    <span className="font-semibold">{oneTime.followingLabel}</span>
                  </>
                )}
                .
              </p>
            )}
          </div>

          {oneTimeLoading ? (
            <div className="flex items-center gap-2 text-gray-400 py-6">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading open times…
            </div>
          ) : !oneTime ? null : oneTime.days.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              No open times before your following regular meeting. Try changing your regular
              schedule instead, or contact {instructorName}.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {oneTimeMonths.map(({ year, month }) => (
                  <BookingMonthGrid
                    key={`${year}-${month}`}
                    year={year}
                    month={month}
                    todayKey={todayKey}
                    selectedDate={selectedDate}
                    meetingDate={meeting?.nextOccurrenceDate ?? null}
                    dayByDate={oneTimeDayByDate}
                    onSelect={(dateKey) => {
                      setSelectedDate(dateKey);
                      setSelectedTime(null);
                    }}
                  />
                ))}
              </div>
              {legend}

              <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                {selectedOneTimeDay && selectedDate ? (
                  <>
                    <div className="font-semibold text-gray-900">{longDate(selectedDate)}</div>
                    <p className="text-sm text-gray-600 mt-0.5">One time only.</p>
                    <TimeButtons
                      times={selectedOneTimeDay.times}
                      selectedTime={selectedTime}
                      onSelect={setSelectedTime}
                    />
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Pick a green day to see open times.</p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {pickerOpen && (
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={
              saving || !selectedTime || (mode === 'regular' && selectionUnchanged)
            }
            title={
              mode === 'regular' && selectionUnchanged ? 'That is already your schedule.' : undefined
            }
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold bg-electric-blue text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'once' ? 'Move this meeting' : meeting ? 'Save new schedule' : 'Save schedule'}
          </button>
          {collapsible && (
            <button
              type="button"
              onClick={meeting ? () => openMode('choose') : closePicker}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {meeting ? 'Back' : 'Cancel'}
            </button>
          )}
          {showSkip && onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={skipping || saving}
              className="text-sm text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {skipping ? 'Skipping…' : 'Skip for now'}
            </button>
          )}
        </div>
      )}

      {pickerOpen && showSkip && onSkip && (
        <p className="mt-3 text-xs text-gray-500">
          Monthly 1:1s are required. If you skip, you have{' '}
          {MUST_BOOK_WARNING_HOURS} hours to book one from your dashboard, or you&apos;ll be
          removed from the Resume Book.
        </p>
      )}

      {confirmOpen && mode === 'regular' && selectedDate && selectedTime && selectedDay && (
        <ModalOverlay onClose={() => !saving && setConfirmOpen(false)}>
          <ModalPanel size="md">
            <h3 className="text-lg font-semibold text-gray-900">
              {meeting ? 'Change your regular schedule?' : 'Confirm your monthly 1:1'}
            </h3>
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
                This permanently replaces your current schedule ({meeting.scheduleLabel}) for every
                future meeting
                {meeting.movedFrom ? ', and cancels your one-time change' : ''}.
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
                onClick={handleSaveRegular}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-electric-blue text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {meeting ? 'Change regular schedule' : 'Confirm'}
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}

      {confirmOpen && mode === 'once' && oneTime && selectedDate && selectedTime && (
        <ModalOverlay onClose={() => !saving && setConfirmOpen(false)}>
          <ModalPanel size="md">
            <h3 className="text-lg font-semibold text-gray-900">Move this one meeting?</h3>
            <p className="text-sm text-gray-500 mt-1">One-time change · with {instructorName}</p>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Instead of</dt>
                <dd className="font-semibold text-gray-500 line-through">
                  {oneTime.original.label}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">New time (this meeting only)</dt>
                <dd className="font-semibold text-gray-900">
                  {longDate(selectedDate)} · {timeRange(selectedTime)}{' '}
                  <span className="font-normal text-gray-400">({timezoneLabel})</span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Your regular schedule</dt>
                <dd className="font-semibold text-gray-900">
                  {regularLabel} <span className="font-normal text-gray-500">— unchanged</span>
                </dd>
              </div>
              {oneTime.followingLabel && (
                <div>
                  <dt className="text-gray-500">Following meeting</dt>
                  <dd className="font-semibold text-gray-900">{oneTime.followingLabel}</dd>
                </div>
              )}
            </dl>

            <p className="mt-4 text-xs text-gray-500">
              {instructorName} will be notified, and we&apos;ll email you an updated calendar invite.
            </p>

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
                onClick={handleSaveOneTime}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-electric-blue text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Move this meeting
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
