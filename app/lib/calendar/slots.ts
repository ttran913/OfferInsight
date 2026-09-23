import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  MEETING_DURATION_MINUTES,
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

export type OccupiedSlot = {
  /** Exact occurrence start (ISO), if known */
  startIso?: string;
  /** Standing weekly key that blocks all future occurrences */
  weeklyKey?: string;
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
  occupied?: OccupiedSlot[];
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

function minutesFromMidnight(hhmm: string): number {
  const { hours, minutes } = parseHhMm(hhmm);
  return hours * 60 + minutes;
}

function hhmmFromMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
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

  const occupiedStarts = new Set(
    (options.occupied ?? [])
      .map((o) => o.startIso)
      .filter((s): s is string => Boolean(s))
      .map((s) => new Date(s).toISOString())
  );
  const occupiedWeekly = new Set(
    (options.occupied ?? []).map((o) => o.weeklyKey).filter((k): k is string => Boolean(k))
  );

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
  const maxDays = Math.max(days * 2, 60); // safety

  for (let i = 0; i < maxDays; i++) {
    const dayStartUtc = zonedWallTimeToUtc(cursor.year, cursor.month, cursor.day, 0, 0, timezone);
    if (dayStartUtc >= rangeEnd) break;

    const noonUtc = zonedWallTimeToUtc(cursor.year, cursor.month, cursor.day, 12, 0, timezone);
    const dayOfWeek = getZonedParts(noonUtc, timezone).dayOfWeek;
    const dayWindows = windowsByDay.get(dayOfWeek) ?? [];
    const localDate = `${cursor.year}-${pad2(cursor.month)}-${pad2(cursor.day)}`;

    for (const window of dayWindows) {
      const startMin = minutesFromMidnight(window.startTime);
      const endMin = minutesFromMidnight(window.endTime);

      for (let t = startMin; t + duration <= endMin; t += duration) {
        const localTime = hhmmFromMinutes(t);
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

        const weeklyKey = `${dayOfWeek}|${localTime}`;
        if (occupiedWeekly.has(weeklyKey)) continue;
        if (occupiedStarts.has(start.toISOString())) continue;

        slots.push({
          start: start.toISOString(),
          end: end.toISOString(),
          dayOfWeek,
          localDate,
          localTime,
          weeklyKey,
          timezone,
        });
      }
    }

    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }

  return slots;
}

/** Unique standing times (weekly keys) still free in the generated range — useful for monthly book picker. */
export function uniqueWeeklyKeys(slots: GeneratedSlot[]): GeneratedSlot[] {
  const seen = new Set<string>();
  const out: GeneratedSlot[] = [];
  for (const slot of slots) {
    if (seen.has(slot.weeklyKey)) continue;
    seen.add(slot.weeklyKey);
    out.push(slot);
  }
  return out;
}
