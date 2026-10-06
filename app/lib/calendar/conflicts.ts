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

export type StandingTimeResolution = {
  /** weeklyKey → first candidate slot whose monthly series is conflict-free */
  anchors: Map<string, GeneratedSlot>;
  /** weeklyKey → earliest conflict, for keys where no candidate start works */
  blocked: Map<string, WeeklyConflict>;
  /** weeklyKey → conflict that pushed the start later than its first candidate */
  shifted: Map<string, WeeklyConflict>;
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
 * For each standing weekly time, pick the earliest candidate slot whose next
 * `seriesCount` monthly meetings avoid every busy interval. Candidate slots must
 * be in chronological order (as produced by generateAvailableSlots).
 */
export function resolveStandingTimes(opts: {
  slots: GeneratedSlot[];
  busy: BusyInterval[];
  durationMinutes: number;
  seriesCount?: number;
}): StandingTimeResolution {
  const seriesCount = opts.seriesCount ?? SERIES_CONFLICT_CHECK_COUNT;
  const durationMs = opts.durationMinutes * 60 * 1000;
  const busy = opts.busy.map((b) => ({
    start: Date.parse(b.start),
    end: Date.parse(b.end),
    title: b.title,
  }));

  const anchors = new Map<string, GeneratedSlot>();
  const firstConflict = new Map<string, WeeklyConflict>();

  for (const slot of opts.slots) {
    if (anchors.has(slot.weeklyKey)) continue;

    let conflict: WeeklyConflict | null = null;
    if (busy.length > 0) {
      for (const start of monthlySeriesStarts(slot, seriesCount)) {
        const end = start + durationMs;
        const hit = busy.find((b) => b.start < end && start < b.end);
        if (hit) {
          conflict = { start: new Date(start).toISOString(), title: hit.title };
          break;
        }
      }
    }

    if (conflict) {
      if (!firstConflict.has(slot.weeklyKey)) firstConflict.set(slot.weeklyKey, conflict);
    } else {
      anchors.set(slot.weeklyKey, slot);
    }
  }

  const blocked = new Map<string, WeeklyConflict>();
  const shifted = new Map<string, WeeklyConflict>();
  for (const [key, conflict] of firstConflict) {
    if (anchors.has(key)) shifted.set(key, conflict);
    else blocked.set(key, conflict);
  }
  return { anchors, blocked, shifted };
}
