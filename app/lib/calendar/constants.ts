/** Shared constants for monthly 1:1 scheduling. */

export const MEETING_DURATION_MINUTES = 20;
export const MEETING_MAX_HEADCOUNT = 1;
export const DEFAULT_AVAILABILITY_TIMEZONE = 'America/Los_Angeles';

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
  return null;
}
