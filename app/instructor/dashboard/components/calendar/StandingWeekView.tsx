"use client"

import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  BOOKING_CANDIDATE_DAYS,
  DAY_LABELS,
  slotStartTimesInWindow,
  type AvailabilityWindowInput,
} from '@/app/lib/calendar/constants';
import type { StandingTimeResolution, WeeklyConflict } from '@/app/lib/calendar/conflicts';
import { nthOrdinalLabel } from '@/app/lib/calendar/next-occurrence';
import { formatTime12, type Booking } from './availability-model';

type Props = {
  windows: AvailabilityWindowInput[];
  bookings: Booking[];
  /** Null when Google busy times are unavailable. */
  resolution: StandingTimeResolution | null;
  durationMinutes: number;
  timezone: string;
};

type Cell =
  | {
      kind: 'open';
      localTime: string;
      shifted?: { conflict: WeeklyConflict; firstMeeting: string };
    }
  | { kind: 'busy'; localTime: string; conflict: WeeklyConflict }
  | { kind: 'booked'; localTime: string; booking: Booking; outsideHours: boolean };

const BUSY_STRIPES = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgb(243 244 246) 0 6px, rgb(229 231 235) 6px 12px)',
};

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
  resolution,
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
      const bookingByTime = new Map(dayBookings.map((b) => [b.localTime, b]));

      const cells: Cell[] = [...new Set([...times, ...bookingByTime.keys()])]
        .sort()
        .map((localTime) => {
          const booking = bookingByTime.get(localTime);
          if (booking) {
            return { kind: 'booked', localTime, booking, outsideHours: !times.has(localTime) };
          }
          const key = `${dayOfWeek}|${localTime}`;
          const blocked = resolution?.blocked.get(key);
          if (blocked) return { kind: 'busy', localTime, conflict: blocked };
          const shiftedBy = resolution?.shifted.get(key);
          const anchor = resolution?.anchors.get(key);
          return shiftedBy && anchor
            ? { kind: 'open', localTime, shifted: { conflict: shiftedBy, firstMeeting: anchor.start } }
            : { kind: 'open', localTime };
        });

      return {
        dayOfWeek,
        label,
        cells,
        openCount: cells.filter((c) => c.kind === 'open').length,
        busyCount: cells.filter((c) => c.kind === 'busy').length,
        bookedCount: dayBookings.length,
      };
    });
  }, [windows, bookings, resolution, durationMinutes]);

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
            {totalOpen} open
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
                          title={
                            cell.shifted
                              ? `First meeting would be ${formatShortDate(cell.shifted.firstMeeting, timezone)} because "${cell.shifted.conflict.title}" is on ${formatShortDate(cell.shifted.conflict.start, timezone)}.`
                              : undefined
                          }
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500"
                        >
                          {formatTime12(cell.localTime)}
                          {cell.shifted && (
                            <div className="text-[11px] text-amber-700">
                              starts {formatShortDate(cell.shifted.firstMeeting, timezone)}
                            </div>
                          )}
                        </div>
                      ) : cell.kind === 'busy' ? (
                        <div
                          key={cell.localTime}
                          title={`Busy: none of the next ${BOOKING_CANDIDATE_DAYS / 7} weeks starts three free monthly meetings at this time. First conflict: "${cell.conflict.title}" on ${formatShortDate(cell.conflict.start, timezone)}. Hidden from students.`}
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
                          title={[
                            cell.booking.studentName,
                            cell.booking.studentEmail,
                            cell.booking.nextOccurrenceLabel &&
                              `Next: ${cell.booking.nextOccurrenceLabel}`,
                            cell.outsideHours &&
                              'Outside your current hours. The student keeps this time until they reschedule.',
                          ]
                            .filter(Boolean)
                            .join('\n')}
                          className={`rounded-md px-2 py-1 text-xs ${
                            cell.outsideHours
                              ? 'bg-amber-50 border border-amber-300 text-amber-900'
                              : 'bg-electric-blue text-white'
                          }`}
                        >
                          <div className="flex items-center gap-1 font-semibold">
                            {cell.outsideHours && <AlertTriangle className="w-3 h-3 shrink-0" />}
                            <span>{formatTime12(cell.localTime)}</span>
                          </div>
                          <div className="truncate">{cell.booking.studentName}</div>
                          <div className={cell.outsideHours ? 'text-amber-700' : 'text-white/80'}>
                            {nthOrdinalLabel(cell.booking.nthWeekday)} {col.label.slice(0, 3)}
                            {cell.booking.nextOccurrence &&
                              ` · ${formatShortDate(cell.booking.nextOccurrence, timezone)}`}
                          </div>
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
