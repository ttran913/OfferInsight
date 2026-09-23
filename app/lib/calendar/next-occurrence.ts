import { nthWeekdayForLocalDate } from './ics';
import { getZonedParts, zonedWallTimeToUtc } from './slots';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Civil date (Y-M-D) of the nth weekday in a month. nth=-1 → last. */
function dateOfNthWeekday(
  year: number,
  month: number,
  dayOfWeek: number,
  nth: number
): number | null {
  if (nth === -1) {
    for (let d = daysInMonth(year, month); d >= 1; d--) {
      if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === dayOfWeek) {
        return d;
      }
    }
    return null;
  }

  let first = 1;
  while (
    first <= 7 &&
    new Date(Date.UTC(year, month - 1, first)).getUTCDay() !== dayOfWeek
  ) {
    first += 1;
  }
  if (first > 7) return null;
  const day = first + (nth - 1) * 7;
  if (day > daysInMonth(year, month)) return null;
  return day;
}

export type NextMonthlyOccurrence = {
  startIso: string;
  localDate: string;
  localTime: string;
};

/**
 * Next upcoming occurrence for a monthly "nth weekday" standing meeting
 * (same RRULE as .ics / Google Calendar).
 */
export function getNextMonthlyOccurrence(opts: {
  dayOfWeek: number;
  localTime: string;
  timezone: string;
  /** Local YYYY-MM-DD that defines which nth weekday (usually firstOccurrence). */
  anchorLocalDate: string;
  now?: Date;
}): NextMonthlyOccurrence | null {
  const now = opts.now ?? new Date();
  const nth = nthWeekdayForLocalDate(opts.anchorLocalDate);
  const [hours, minutes] = opts.localTime.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const nowParts = getZonedParts(now, opts.timezone);
  let year = nowParts.year;
  let month = nowParts.month;

  for (let i = 0; i < 14; i++) {
    const day = dateOfNthWeekday(year, month, opts.dayOfWeek, nth);
    if (day != null) {
      const start = zonedWallTimeToUtc(
        year,
        month,
        day,
        hours,
        minutes,
        opts.timezone
      );
      if (start.getTime() >= now.getTime()) {
        return {
          startIso: start.toISOString(),
          localDate: `${year}-${pad2(month)}-${pad2(day)}`,
          localTime: opts.localTime,
        };
      }
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return null;
}

export function anchorLocalDateFromOccurrence(
  occurrence: Date,
  timezone: string
): string {
  const p = getZonedParts(occurrence, timezone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Human-readable next meeting line, e.g. "Wednesday, April 8, 2026 at 10:00 AM PDT". */
export function formatNextMeetingLabel(
  startIso: string,
  timezone: string
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(startIso));
}
