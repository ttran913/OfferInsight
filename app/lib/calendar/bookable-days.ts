import { MEETING_DURATION_MINUTES, type AvailabilityWindowInput } from './constants';
import { seriesConflict, type BusyInterval } from './conflicts';
import { nthWeekdayForLocalDate } from './ics';
import { generateAvailableSlots, getZonedParts, zonedWallTimeToUtc, type GeneratedSlot } from './slots';

/** Another student's standing meeting with the same instructor. */
export type BookedSeries = {
  weeklyKey: string;
  nthWeekday: number;
};

export type BookableDay = {
  /** YYYY-MM-DD in the instructor timezone */
  localDate: string;
  dayOfWeek: number;
  /** 1–4, or -1 for last */
  nthWeekday: number;
  slots: GeneratedSlot[];
};

/** Two weeks of the month collide when they can fall on the same date. */
export function weeksCollide(a: number, b: number): boolean {
  if (a === b) return true;
  // 4th and last are the same day whenever a month has only four of that weekday.
  return (a === 4 && b === -1) || (a === -1 && b === 4);
}

/** Booking window: now until the first day of the month after next (instructor timezone). */
export function bookingWindowEnd(now: Date, timezone: string): Date {
  const p = getZonedParts(now, timezone);
  const m0 = p.month - 1 + 2;
  return zonedWallTimeToUtc(p.year + Math.floor(m0 / 12), (m0 % 12) + 1, 1, 0, 0, timezone);
}

/** Every slot inside the instructor's weekly hours from now through the end of next month. */
export function bookingWindowSlots(opts: {
  windows: AvailabilityWindowInput[];
  timezone: string;
  durationMinutes?: number;
  now?: Date;
}): GeneratedSlot[] {
  const now = opts.now ?? new Date();
  const rangeEnd = bookingWindowEnd(now, opts.timezone);
  return generateAvailableSlots({
    windows: opts.windows,
    timezone: opts.timezone,
    durationMinutes: opts.durationMinutes ?? MEETING_DURATION_MINUTES,
    now,
    rangeStart: now,
    rangeEnd,
    days: Math.ceil((rangeEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  });
}

/**
 * Dates a student can start a monthly series on, with the open times for each.
 * A slot is open when no other student holds a colliding week at that weekday
 * and time, and the series' next meetings avoid every busy interval.
 */
export function findBookableDays(opts: {
  slots: GeneratedSlot[];
  busy: BusyInterval[];
  booked: BookedSeries[];
  durationMinutes: number;
}): BookableDay[] {
  const bookedWeeks = new Map<string, number[]>();
  for (const b of opts.booked) {
    bookedWeeks.set(b.weeklyKey, [...(bookedWeeks.get(b.weeklyKey) ?? []), b.nthWeekday]);
  }

  const days = new Map<string, BookableDay>();
  for (const slot of opts.slots) {
    const nthWeekday = nthWeekdayForLocalDate(slot.localDate);
    if (bookedWeeks.get(slot.weeklyKey)?.some((nth) => weeksCollide(nth, nthWeekday))) continue;
    if (seriesConflict(slot, opts.busy, opts.durationMinutes)) continue;

    const day = days.get(slot.localDate) ?? {
      localDate: slot.localDate,
      dayOfWeek: slot.dayOfWeek,
      nthWeekday,
      slots: [],
    };
    day.slots.push(slot);
    days.set(slot.localDate, day);
  }
  return [...days.values()];
}
