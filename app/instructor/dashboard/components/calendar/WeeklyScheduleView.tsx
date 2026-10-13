"use client"

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DAY_LABELS,
  slotStartTimesInWindow,
  type AvailabilityWindowInput,
} from '@/app/lib/calendar/constants';
import type { BusyInterval } from '@/app/lib/calendar/conflicts';
import { formatTime12, nthOrdinalLabel } from '@/app/lib/calendar/labels';
import { localDateKey } from '@/app/lib/calendar/month-grid';
import { getZonedParts, zonedWallTimeToUtc } from '@/app/lib/calendar/slots';
import {
  WEEKS_AHEAD,
  seriesMeetsOn,
  weekDates,
  weekOfMonthLabel,
} from '@/app/lib/calendar/week-schedule';
import type { Booking } from './availability-model';

type Props = {
  windows: AvailabilityWindowInput[];
  bookings: Booking[];
  /** Google busy times; null when unavailable. */
  busy: BusyInterval[] | null;
  durationMinutes: number;
  timezone: string;
};

/** movedTo: this regular date was moved elsewhere (ISO). oneTime: a moved meeting landing here. */
type Meeting = { booking: Booking; movedTo: string | null; oneTime: boolean };

type Cell =
  | { kind: 'open'; localTime: string; past: boolean }
  | { kind: 'busy'; localTime: string; past: boolean; title: string }
  | { kind: 'booked'; localTime: string; past: boolean; meetings: Meeting[]; outsideHours: boolean };

const BUSY_STRIPES = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgb(243 244 246) 0 6px, rgb(229 231 235) 6px 12px)',
};

function dateParts(dateKey: string): [number, number, number] {
  const [y, m, d] = dateKey.split('-').map(Number);
  return [y, m, d];
}

function formatDateKey(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateParts(dateKey);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

function movedToLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function weekTitle(offset: number): string {
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  return `In ${offset} weeks`;
}

export default function WeeklyScheduleView({
  windows,
  bookings,
  busy,
  durationMinutes,
  timezone,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [bookedOnly, setBookedOnly] = useState(false);
  const [now] = useState(() => Date.now());
  const todayKey = localDateKey(new Date(now), timezone);

  const columns = useMemo(() => {
    const durationMs = durationMinutes * 60 * 1000;
    return weekDates(todayKey, weekOffset).map((dateKey) => {
      const [y, m, d] = dateParts(dateKey);
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

      const times = new Set<string>();
      for (const w of windows) {
        if (w.dayOfWeek !== dayOfWeek) continue;
        for (const t of slotStartTimesInWindow(w.startTime, w.endTime, durationMinutes)) {
          times.add(t);
        }
      }
      const meetingsByTime = new Map<string, Meeting[]>();
      const addMeeting = (localTime: string, meeting: Meeting) =>
        meetingsByTime.set(localTime, [...(meetingsByTime.get(localTime) ?? []), meeting]);
      for (const b of bookings) {
        if (b.dayOfWeek === dayOfWeek && seriesMeetsOn(b, dateKey)) {
          const [hh, mm] = b.localTime.split(':').map(Number);
          const start = zonedWallTimeToUtc(y, m, d, hh, mm, timezone).getTime();
          const move = b.moves.find((mv) => Date.parse(mv.originalStart) === start);
          addMeeting(b.localTime, { booking: b, movedTo: move?.newStart ?? null, oneTime: false });
        }
        for (const mv of b.moves) {
          const newStart = new Date(mv.newStart);
          if (localDateKey(newStart, timezone) !== dateKey) continue;
          const p = getZonedParts(newStart, timezone);
          const localTime = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
          addMeeting(localTime, { booking: b, movedTo: null, oneTime: true });
        }
      }

      const cells: Cell[] = [...new Set([...times, ...meetingsByTime.keys()])]
        .sort()
        .map((localTime) => {
          const [hh, mm] = localTime.split(':').map(Number);
          const start = zonedWallTimeToUtc(y, m, d, hh, mm, timezone).getTime();
          const past = start < now;
          const atTime = meetingsByTime.get(localTime);
          if (atTime) {
            return {
              kind: 'booked',
              localTime,
              past,
              outsideHours: !times.has(localTime),
              meetings: atTime,
            };
          }
          const hit = busy?.find(
            (b) => Date.parse(b.start) < start + durationMs && start < Date.parse(b.end)
          );
          return hit
            ? { kind: 'busy', localTime, past, title: hit.title }
            : { kind: 'open', localTime, past };
        });

      const meetings = cells.flatMap((c) => (c.kind === 'booked' ? c.meetings : []));
      return {
        dateKey,
        dayOfWeek,
        isToday: dateKey === todayKey,
        isPast: dateKey < todayKey,
        cells,
        openCount: cells.filter((c) => c.kind === 'open' && !c.past).length,
        busyCount: cells.filter((c) => c.kind === 'busy').length,
        meetingCount: meetings.filter((mt) => !mt.movedTo).length,
        movedAwayCount: meetings.filter((mt) => mt.movedTo).length,
      };
    });
  }, [windows, bookings, busy, durationMinutes, timezone, todayKey, weekOffset, now]);

  const totalOpen = columns.reduce((sum, c) => sum + c.openCount, 0);
  const totalBusy = columns.reduce((sum, c) => sum + c.busyCount, 0);
  const totalMeetings = columns.reduce((sum, c) => sum + c.meetingCount, 0);
  const totalMovedAway = columns.reduce((sum, c) => sum + c.movedAwayCount, 0);
  const hasOutsideHours = columns.some((col) =>
    col.cells.some((c) => c.kind === 'booked' && c.outsideHours)
  );
  const firstDate = columns[0].dateKey;
  const lastDate = columns[6].dateKey;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            disabled={weekOffset === 0}
            aria-label="Previous week"
            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-[12rem] text-center">
            <div className="text-sm font-semibold text-gray-900">
              {formatDateKey(firstDate, { month: 'short', day: 'numeric' })} –{' '}
              {formatDateKey(lastDate, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="text-xs text-gray-500">
              {weekTitle(weekOffset)} · week {weekOffset + 1} of {WEEKS_AHEAD + 1}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={weekOffset === WEEKS_AHEAD}
            aria-label="Next week"
            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setBookedOnly(false)}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              !bookedOnly ? 'bg-electric-blue text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            All times
          </button>
          <button
            type="button"
            onClick={() => setBookedOnly(true)}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              bookedOnly ? 'bg-electric-blue text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Booked only
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm mb-4">
        <span className="inline-flex items-center gap-1.5 text-gray-700">
          <span className="h-3 w-3 rounded-sm border border-gray-300 bg-white" />
          {totalOpen} open
        </span>
        <span className="inline-flex items-center gap-1.5 text-gray-700">
          <span className="h-3 w-3 rounded-sm bg-electric-blue" />
          {totalMeetings} {totalMeetings === 1 ? 'meeting' : 'meetings'}
        </span>
        {totalMovedAway > 0 && (
          <span className="inline-flex items-center gap-1.5 text-gray-700">
            <span className="h-3 w-3 rounded-sm border border-electric-blue/40 bg-electric-blue/10" />
            {totalMovedAway} moved to another day
          </span>
        )}
        {totalBusy > 0 && (
          <span className="inline-flex items-center gap-1.5 text-gray-700">
            <span className="h-3 w-3 rounded-sm border border-gray-300" style={BUSY_STRIPES} />
            {totalBusy} busy on Google Calendar
          </span>
        )}
        {hasOutsideHours && (
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <span className="h-3 w-3 rounded-sm bg-amber-400" />
            outside your hours
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[56rem]">
          {columns.map((col) => {
            const visible = bookedOnly ? col.cells.filter((c) => c.kind === 'booked') : col.cells;
            return (
              <div
                key={col.dateKey}
                className={`flex flex-col rounded-lg border bg-gray-50 min-w-0 ${
                  col.isToday ? 'border-electric-blue' : 'border-gray-200'
                } ${col.isPast ? 'opacity-60' : ''}`}
              >
                <div className="px-2 py-2 border-b border-gray-200 bg-white rounded-t-lg text-center">
                  <div
                    className={`text-sm font-semibold ${
                      col.isToday ? 'text-electric-blue' : 'text-gray-900'
                    }`}
                  >
                    {DAY_LABELS[col.dayOfWeek].slice(0, 3)}{' '}
                    {formatDateKey(col.dateKey, { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {weekOfMonthLabel(col.dateKey)} {DAY_LABELS[col.dayOfWeek].slice(0, 3)}
                    {col.isToday && ' · Today'}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {col.openCount} open · {col.meetingCount} booked
                    {col.busyCount > 0 && ` · ${col.busyCount} busy`}
                  </div>
                </div>
                <div className="flex-1 max-h-[28rem] overflow-y-auto p-1.5 space-y-1">
                  {visible.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      {col.cells.length === 0 ? 'No hours set' : 'No meetings'}
                    </p>
                  ) : (
                    visible.map((cell) => (
                      <div key={cell.localTime} className={cell.past ? 'opacity-50' : undefined}>
                        <SlotCell cell={cell} timezone={timezone} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SlotCell({ cell, timezone }: { cell: Cell; timezone: string }) {
  if (cell.kind === 'open') {
    return (
      <div className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500">
        {formatTime12(cell.localTime)}
      </div>
    );
  }

  if (cell.kind === 'busy') {
    return (
      <div
        title={`Busy on Google Calendar: "${cell.title}". Students can't book a series that lands here.`}
        style={BUSY_STRIPES}
        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500"
      >
        <div className="flex items-center justify-between gap-1">
          <span>{formatTime12(cell.localTime)}</span>
          <span className="font-semibold">Busy</span>
        </div>
        <div className="truncate text-[11px]">{cell.title}</div>
      </div>
    );
  }

  const allMovedAway = cell.meetings.every((mt) => mt.movedTo);
  const anyOneTime = cell.meetings.some((mt) => mt.oneTime);
  const { outsideHours } = cell;
  const tone = outsideHours
    ? 'bg-amber-50 border border-amber-300 text-amber-900'
    : allMovedAway
      ? 'bg-electric-blue/10 border border-electric-blue/40 text-electric-blue'
      : 'bg-electric-blue text-white';
  const subtle = outsideHours || allMovedAway ? 'opacity-80' : 'text-white/80';
  return (
    <div
      title={
        outsideHours
          ? 'Outside your current hours. These students keep their time until they reschedule.'
          : undefined
      }
      className={`rounded-md px-2 py-1 text-xs ${tone}`}
    >
      <div className="flex items-center justify-between gap-1 font-semibold">
        <span className="inline-flex items-center gap-1">
          {outsideHours && <AlertTriangle className="w-3 h-3 shrink-0" />}
          {formatTime12(cell.localTime)}
        </span>
        {allMovedAway ? (
          <span className="text-[10px] uppercase">Moved</span>
        ) : (
          anyOneTime && <span className="text-[10px] uppercase">One-time</span>
        )}
      </div>
      {cell.meetings.map(({ booking: b, movedTo, oneTime }) => (
        <div
          key={`${b.id}-${oneTime ? 'once' : 'regular'}`}
          title={[
            b.studentName,
            b.studentEmail,
            `Meets the ${nthOrdinalLabel(b.nthWeekday)} ${DAY_LABELS[b.dayOfWeek]} each month`,
            movedTo && `Moved to ${movedToLabel(movedTo, timezone)}, this date only`,
            oneTime && 'One-time move; their regular schedule is unchanged',
            b.nextOccurrenceLabel && `Next meeting: ${b.nextOccurrenceLabel}`,
          ]
            .filter(Boolean)
            .join('\n')}
          className="truncate"
        >
          <span className={movedTo ? 'line-through' : undefined}>{b.studentName}</span>
          {movedTo && (
            <span className={`block truncate text-[11px] ${subtle}`}>
              Moved to {movedToLabel(movedTo, timezone)}
            </span>
          )}
          {oneTime && !allMovedAway && cell.meetings.length > 1 && (
            <span className={subtle}> (one-time)</span>
          )}
        </div>
      ))}
    </div>
  );
}
