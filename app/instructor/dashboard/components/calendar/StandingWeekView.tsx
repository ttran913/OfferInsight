"use client"

import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  DAY_LABELS,
  slotStartTimesInWindow,
  type AvailabilityWindowInput,
} from '@/app/lib/calendar/constants';
import type { WeeklyConflict } from '@/app/lib/calendar/conflicts';
import { formatTime12, nthOrdinalLabel } from '@/app/lib/calendar/labels';
import type { Booking } from './availability-model';

type Props = {
  windows: AvailabilityWindowInput[];
  bookings: Booking[];
  /** weeklyKey → Google conflict, for times with no bookable date. Null when Google busy times are unavailable. */
  blocked: Map<string, WeeklyConflict> | null;
  durationMinutes: number;
  timezone: string;
};

type Cell =
  | { kind: 'open'; localTime: string }
  | { kind: 'busy'; localTime: string; conflict: WeeklyConflict }
  | { kind: 'booked'; localTime: string; bookings: Booking[]; outsideHours: boolean; full: boolean };

const BUSY_STRIPES = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgb(243 244 246) 0 6px, rgb(229 231 235) 6px 12px)',
};

/** Sort order for weeks of the month: 1st..4th, then Last. */
function weekOrder(nth: number): number {
  return nth === -1 ? 5 : nth;
}

/** A time is full once 1st, 2nd, 3rd and 4th/Last are taken (4th and Last collide). */
function isFull(bookings: Booking[]): boolean {
  return new Set(bookings.map((b) => (b.nthWeekday === -1 ? 4 : b.nthWeekday))).size >= 4;
}

function formatShortDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export default function StandingWeekView({
  windows,
  bookings,
  blocked,
  durationMinutes,
  timezone,
}: Props) {
  const [bookedOnly, setBookedOnly] = useState(false);

  const columns = useMemo(() => {
    return DAY_LABELS.map((label, dayOfWeek) => {
      const times = new Set<string>();
      for (const w of windows) {
        if (w.dayOfWeek !== dayOfWeek) continue;
        for (const t of slotStartTimesInWindow(w.startTime, w.endTime, durationMinutes)) {
          times.add(t);
        }
      }
      const dayBookings = bookings.filter((b) => b.dayOfWeek === dayOfWeek);
      const bookingsByTime = new Map<string, Booking[]>();
      for (const b of dayBookings) {
        bookingsByTime.set(b.localTime, [...(bookingsByTime.get(b.localTime) ?? []), b]);
      }

      const cells: Cell[] = [...new Set([...times, ...bookingsByTime.keys()])]
        .sort()
        .map((localTime) => {
          const atTime = bookingsByTime.get(localTime);
          if (atTime) {
            return {
              kind: 'booked',
              localTime,
              bookings: [...atTime].sort((a, b) => weekOrder(a.nthWeekday) - weekOrder(b.nthWeekday)),
              outsideHours: !times.has(localTime),
              full: isFull(atTime),
            };
          }
          const conflict = blocked?.get(`${dayOfWeek}|${localTime}`);
          return conflict ? { kind: 'busy', localTime, conflict } : { kind: 'open', localTime };
        });

      return {
        dayOfWeek,
        label,
        cells,
        openCount: cells.filter(
          (c) => c.kind === 'open' || (c.kind === 'booked' && !c.full && !c.outsideHours)
        ).length,
        busyCount: cells.filter((c) => c.kind === 'busy').length,
        bookedCount: dayBookings.length,
      };
    });
  }, [windows, bookings, blocked, durationMinutes]);

  const totalOpen = columns.reduce((sum, c) => sum + c.openCount, 0);
  const totalBusy = columns.reduce((sum, c) => sum + c.busyCount, 0);
  const totalBooked = bookings.length;
  const hasOutsideHours = columns.some((col) =>
    col.cells.some((c) => c.kind === 'booked' && c.outsideHours)
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-gray-700">
            <span className="h-3 w-3 rounded-sm border border-gray-300 bg-white" />
            {totalOpen} times with room
          </span>
          <span className="inline-flex items-center gap-1.5 text-gray-700">
            <span className="h-3 w-3 rounded-sm bg-electric-blue" />
            {totalBooked} booked
          </span>
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

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[56rem]">
          {columns.map((col) => {
            const visible = bookedOnly ? col.cells.filter((c) => c.kind === 'booked') : col.cells;
            return (
              <div
                key={col.dayOfWeek}
                className="flex flex-col rounded-lg border border-gray-200 bg-gray-50 min-w-0"
              >
                <div className="px-2 py-2 border-b border-gray-200 bg-white rounded-t-lg text-center">
                  <div className="text-sm font-semibold text-gray-900">{col.label.slice(0, 3)}</div>
                  <div className="text-[11px] text-gray-500">
                    {col.openCount} open · {col.bookedCount} booked
                    {col.busyCount > 0 && ` · ${col.busyCount} busy`}
                  </div>
                </div>
                <div className="flex-1 max-h-[28rem] overflow-y-auto p-1.5 space-y-1">
                  {visible.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      {col.cells.length === 0 ? 'No hours set' : 'No bookings'}
                    </p>
                  ) : (
                    visible.map((cell) =>
                      cell.kind === 'open' ? (
                        <div
                          key={cell.localTime}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500"
                        >
                          {formatTime12(cell.localTime)}
                        </div>
                      ) : cell.kind === 'busy' ? (
                        <div
                          key={cell.localTime}
                          title={`Busy: no date this month or next starts three free monthly meetings at this time. First conflict: "${cell.conflict.title}" on ${formatShortDate(cell.conflict.start, timezone)}. Hidden from students.`}
                          style={BUSY_STRIPES}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span>{formatTime12(cell.localTime)}</span>
                            <span className="font-semibold">Busy</span>
                          </div>
                          <div className="truncate text-[11px]">{cell.conflict.title}</div>
                        </div>
                      ) : (
                        <div
                          key={cell.localTime}
                          title={
                            cell.outsideHours
                              ? 'Outside your current hours. These students keep their time until they reschedule.'
                              : undefined
                          }
                          className={`rounded-md px-2 py-1 text-xs ${
                            cell.outsideHours
                              ? 'bg-amber-50 border border-amber-300 text-amber-900'
                              : 'bg-electric-blue text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 font-semibold">
                            <span className="inline-flex items-center gap-1">
                              {cell.outsideHours && <AlertTriangle className="w-3 h-3 shrink-0" />}
                              {formatTime12(cell.localTime)}
                            </span>
                            {cell.full && <span className="text-[10px] uppercase">Full</span>}
                          </div>
                          {cell.bookings.map((b) => (
                            <div
                              key={b.id}
                              title={[
                                b.studentName,
                                b.studentEmail,
                                b.nextOccurrenceLabel && `Next: ${b.nextOccurrenceLabel}`,
                              ]
                                .filter(Boolean)
                                .join('\n')}
                              className="truncate"
                            >
                              <span className={cell.outsideHours ? 'text-amber-700' : 'text-white/80'}>
                                {nthOrdinalLabel(b.nthWeekday)}
                              </span>{' '}
                              {b.studentName}
                            </div>
                          ))}
                        </div>
                      )
                    )
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
