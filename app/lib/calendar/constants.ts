/** Shared constants for monthly 1:1 scheduling. */

export const MEETING_DURATION_MINUTES = 20;
export const MEETING_MAX_HEADCOUNT = 1;
export const DEFAULT_AVAILABILITY_TIMEZONE = 'America/Los_Angeles';
/** How far ahead a student's first monthly meeting may start. */
export const BOOKING_CANDIDATE_DAYS = 42;
/** A start date is usable only if this many monthly meetings in a row are conflict-free. */
export const SERIES_CONFLICT_CHECK_COUNT = 3;
/** Google busy lookahead: candidate window plus two more months of the series. */
export const BUSY_LOOKAHEAD_DAYS = 110;

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

export const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type AvailabilityWindowInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone?: string;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHhMm(value: string): boolean {
  return TIME_RE.test(value);
}

export function validateAvailabilityWindows(
  windows: AvailabilityWindowInput[]
): string | null {
  for (const window of windows) {
    if (!Number.isInteger(window.dayOfWeek) || window.dayOfWeek < 0 || window.dayOfWeek > 6) {
      return 'Each window needs a dayOfWeek from 0 (Sunday) to 6 (Saturday).';
    }
    if (!isValidHhMm(window.startTime) || !isValidHhMm(window.endTime)) {
      return 'Start and end times must be HH:mm (24-hour).';
    }
    if (window.startTime >= window.endTime) {
      return `End time must be after start time for ${DAY_LABELS[window.dayOfWeek]}.`;
    }
  }

  const sorted = [...windows].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.dayOfWeek === curr.dayOfWeek && curr.startTime < prev.endTime) {
      return `Time ranges overlap on ${DAY_LABELS[curr.dayOfWeek]}.`;
    }
  }
  return null;
}

/** Slot start times (HH:mm) that fit inside one availability window. */
export function slotStartTimesInWindow(
  startTime: string,
  endTime: string,
  durationMinutes: number = MEETING_DURATION_MINUTES
): string[] {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  const out: string[] = [];
  for (let t = startMin; t + durationMinutes <= endMin; t += durationMinutes) {
    out.push(
      `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
    );
  }
  return out;
}
