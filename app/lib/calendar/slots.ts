import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  MEETING_DURATION_MINUTES,
  slotStartTimesInWindow,
  type AvailabilityWindowInput,
} from './constants';

export type GeneratedSlot = {
  /** UTC instant ISO */
  start: string;
  /** UTC instant ISO */
  end: string;
  dayOfWeek: number;
  /** YYYY-MM-DD in the instructor timezone */
  localDate: string;
  /** HH:mm in the instructor timezone */
  localTime: string;
  /** Standing monthly key: `${dayOfWeek}|${localTime}` */
  weeklyKey: string;
  timezone: string;
};

type GenerateSlotsOptions = {
  windows: AvailabilityWindowInput[];
  /** Inclusive range start (Date or ISO). Defaults to now. */
  rangeStart?: Date;
  /** Exclusive range end. Defaults to rangeStart + days. */
  rangeEnd?: Date;
  /** Used when rangeEnd omitted. Default 14. */
  days?: number;
  durationMinutes?: number;
  timezone?: string;
  /** Skip slots that start before this instant. Default now. */
  now?: Date;
};

function parseHhMm(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(':').map(Number);
  return { hours: h, minutes: m };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parts of an instant as wall-clock in a timezone. */
export function getZonedParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number; dayOfWeek: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  let hour = Number(parts.hour);
  // Some engines emit "24" for midnight
  if (hour === 24) hour = 0;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayOfWeek: weekdayMap[parts.weekday] ?? 0,
  };
}

/**
 * Convert a wall-clock date/time in `timeZone` to a UTC Date.
 * Iterates once to correct for DST offset.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(utc, timeZone);
    const asUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = wantedMs - asUtcMs;
    if (diff === 0) break;
    utc = new Date(utc.getTime() + diff);
  }
  return utc;
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

/**
 * Carve instructor weekly windows into exclusive 20-min (default) slots
 * across a date range in the instructor timezone.
 */
export function generateAvailableSlots(options: GenerateSlotsOptions): GeneratedSlot[] {
  const timezone = options.timezone || DEFAULT_AVAILABILITY_TIMEZONE;
  const duration = options.durationMinutes ?? MEETING_DURATION_MINUTES;
  const now = options.now ?? new Date();
  const rangeStart = options.rangeStart ?? now;
  const days = options.days ?? 14;
  const rangeEnd =
    options.rangeEnd ?? new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);

  const windowsByDay = new Map<number, AvailabilityWindowInput[]>();
  for (const w of options.windows) {
    const list = windowsByDay.get(w.dayOfWeek) ?? [];
    list.push(w);
    windowsByDay.set(w.dayOfWeek, list);
  }

  const startParts = getZonedParts(rangeStart, timezone);
  let cursor = { year: startParts.year, month: startParts.month, day: startParts.day };

  // Walk calendar days until past rangeEnd (in timezone)
  const slots: GeneratedSlot[] = [];
  const maxDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 2;

  for (let i = 0; i < maxDays; i++) {
    const dayStartUtc = zonedWallTimeToUtc(cursor.year, cursor.month, cursor.day, 0, 0, timezone);
    if (dayStartUtc >= rangeEnd) break;

    const noonUtc = zonedWallTimeToUtc(cursor.year, cursor.month, cursor.day, 12, 0, timezone);
    const dayOfWeek = getZonedParts(noonUtc, timezone).dayOfWeek;
    const dayWindows = windowsByDay.get(dayOfWeek) ?? [];
    const localDate = `${cursor.year}-${pad2(cursor.month)}-${pad2(cursor.day)}`;

    for (const window of dayWindows) {
      for (const localTime of slotStartTimesInWindow(window.startTime, window.endTime, duration)) {
        const { hours, minutes } = parseHhMm(localTime);
        const start = zonedWallTimeToUtc(
          cursor.year,
          cursor.month,
          cursor.day,
          hours,
          minutes,
          timezone
        );
        const end = new Date(start.getTime() + duration * 60 * 1000);

        if (start < now) continue;
        if (start >= rangeEnd) continue;

        slots.push({
          start: start.toISOString(),
          end: end.toISOString(),
          dayOfWeek,
          localDate,
          localTime,
          weeklyKey: `${dayOfWeek}|${localTime}`,
          timezone,
        });
      }
    }

    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }

  return slots;
}
