import { SERIES_CONFLICT_CHECK_COUNT } from './constants';
import { nthWeekdayForLocalDate } from './ics';
import { dateOfNthWeekday } from './next-occurrence';
import { zonedWallTimeToUtc, type GeneratedSlot } from './slots';

export type BusyInterval = {
  /** ISO instant */
  start: string;
  /** ISO instant */
  end: string;
  title: string;
};

export type WeeklyConflict = {
  /** ISO start of the first conflicting occurrence */
  start: string;
  title: string;
};

/** Start instants (ms) of a monthly nth-weekday series beginning at `anchor`. */
export function monthlySeriesStarts(anchor: GeneratedSlot, count: number): number[] {
  const [year, month] = anchor.localDate.split('-').map(Number);
  const [hours, minutes] = anchor.localTime.split(':').map(Number);
  const nth = nthWeekdayForLocalDate(anchor.localDate);
  const starts = [Date.parse(anchor.start)];
  for (let k = 1; k < count; k++) {
    const m0 = month - 1 + k;
    const y = year + Math.floor(m0 / 12);
    const m = (m0 % 12) + 1;
    const day = dateOfNthWeekday(y, m, anchor.dayOfWeek, nth);
    if (day == null) continue;
    starts.push(zonedWallTimeToUtc(y, m, day, hours, minutes, anchor.timezone).getTime());
  }
  return starts;
}

/**
 * First busy interval hit by the monthly series starting at `slot` (its next
 * `seriesCount` meetings), or null when the whole series is free.
 */
export function seriesConflict(
  slot: GeneratedSlot,
  busy: BusyInterval[],
  durationMinutes: number,
  seriesCount: number = SERIES_CONFLICT_CHECK_COUNT
): WeeklyConflict | null {
  if (busy.length === 0) return null;
  const durationMs = durationMinutes * 60 * 1000;
  for (const start of monthlySeriesStarts(slot, seriesCount)) {
    const end = start + durationMs;
    const hit = busy.find((b) => Date.parse(b.start) < end && start < Date.parse(b.end));
    if (hit) return { start: new Date(start).toISOString(), title: hit.title };
  }
  return null;
}
