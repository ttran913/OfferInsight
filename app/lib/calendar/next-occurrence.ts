import { DAY_LABELS, MEETING_DURATION_MINUTES } from './constants';
import { nthWeekdayForLocalDate } from './ics';
import { nthOrdinalLabel } from './labels';
import { getZonedParts, zonedWallTimeToUtc, type GeneratedSlot } from './slots';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Civil date (Y-M-D) of the nth weekday in a month. nth=-1 → last. */
export function dateOfNthWeekday(
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
  /** Occurrence starts to step over (e.g. dates moved elsewhere one time). */
  excludedStarts?: Date[];
}): NextMonthlyOccurrence | null {
  const now = opts.now ?? new Date();
  const excluded = new Set((opts.excludedStarts ?? []).map((d) => d.getTime()));
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
      if (start.getTime() >= now.getTime() && !excluded.has(start.getTime())) {
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

/** First slot of a stored monthly series; the invite UID and RRULE are derived from it. */
export function seriesAnchorSlot(meeting: {
  weeklyKey: string;
  dayOfWeek: number;
  localTime: string;
  timezone: string;
  firstOccurrence: Date;
}): GeneratedSlot {
  return {
    start: meeting.firstOccurrence.toISOString(),
    end: new Date(
      meeting.firstOccurrence.getTime() + MEETING_DURATION_MINUTES * 60 * 1000
    ).toISOString(),
    dayOfWeek: meeting.dayOfWeek,
    localDate: anchorLocalDateFromOccurrence(meeting.firstOccurrence, meeting.timezone),
    localTime: meeting.localTime,
    weeklyKey: meeting.weeklyKey,
    timezone: meeting.timezone,
  };
}

/** Same nth weekday in the month after `localDate`, e.g. 2nd Wed Jun 10 → 2nd Wed Jul 8. */
export function followingMonthlyLocalDate(localDate: string): string | null {
  const [y, m, d] = localDate.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const day = dateOfNthWeekday(nextYear, nextMonth, dayOfWeek, nthWeekdayForLocalDate(localDate));
  return day == null ? null : `${nextYear}-${pad2(nextMonth)}-${pad2(day)}`;
}

/** Standing monthly schedule, e.g. "4th Thursdays at 13:00". */
export function formatMonthlyScheduleLabel(
  nth: number,
  dayOfWeek: number,
  localTime: string
): string {
  return `${nthOrdinalLabel(nth)} ${DAY_LABELS[dayOfWeek]}s at ${localTime}`;
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
