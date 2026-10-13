import {
  MEETING_DURATION_MINUTES,
  slotStartTimesInWindow,
  type AvailabilityWindowInput,
} from '@/app/lib/calendar/constants';

export type TimeRange = { key: string; startTime: string; endTime: string };

export type DayAvailability = {
  dayOfWeek: number;
  ranges: TimeRange[];
};

export type SavedWindow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type Booking = {
  id: string;
  studentName: string;
  studentEmail: string | null;
  weeklyKey: string;
  dayOfWeek: number;
  localTime: string;
  /** 1–4, or -1 for "last" weekday of the month */
  nthWeekday: number;
  /** YYYY-MM-DD (instructor timezone) of the series' first meeting. */
  firstOccurrenceDate: string;
  nextOccurrenceLabel: string | null;
  /** Recent and upcoming one-time moves (ISO); the series itself is unchanged. */
  moves: { originalStart: string; newStart: string }[];
};

export const DEFAULT_RANGE = { startTime: '09:00', endTime: '17:00' };

/** 15-minute steps from 00:00 to 23:45. */
export const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

export function newRangeKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function windowsToDays(windows: Pick<SavedWindow, 'dayOfWeek' | 'startTime' | 'endTime'>[]): DayAvailability[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const ranges = windows
      .filter((w) => w.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((w) => ({ key: newRangeKey(), startTime: w.startTime, endTime: w.endTime }));
    return { dayOfWeek, ranges };
  });
}

export function daysToWindows(days: DayAvailability[]): AvailabilityWindowInput[] {
  return days
    .flatMap((d) =>
      d.ranges.map((r) => ({ dayOfWeek: d.dayOfWeek, startTime: r.startTime, endTime: r.endTime }))
    )
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

export function windowsSignature(windows: AvailabilityWindowInput[]): string {
  return windows.map((w) => `${w.dayOfWeek}|${w.startTime}|${w.endTime}`).join(',');
}

/** Per-range validation messages for one day, keyed by range key. */
export function rangeErrors(day: DayAvailability): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const r of day.ranges) {
    if (r.startTime >= r.endTime) errors[r.key] = 'End must be after start';
  }
  const sorted = [...day.ranges].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime) {
      errors[sorted[i].key] ??= 'Overlaps another range';
      errors[sorted[i - 1].key] ??= 'Overlaps another range';
    }
  }
  return errors;
}

export function slotCountForDay(
  day: DayAvailability,
  durationMinutes: number = MEETING_DURATION_MINUTES
): number {
  return day.ranges.reduce(
    (sum, r) => sum + slotStartTimesInWindow(r.startTime, r.endTime, durationMinutes).length,
    0
  );
}

export function weeklyKeysForWindows(
  windows: AvailabilityWindowInput[],
  durationMinutes: number = MEETING_DURATION_MINUTES
): Set<string> {
  const keys = new Set<string>();
  for (const w of windows) {
    for (const t of slotStartTimesInWindow(w.startTime, w.endTime, durationMinutes)) {
      keys.add(`${w.dayOfWeek}|${t}`);
    }
  }
  return keys;
}
