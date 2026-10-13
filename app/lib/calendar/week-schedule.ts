import { nthOrdinalLabel } from './labels';
import { addDaysToDateKey } from './month-grid';
import { dateOfNthWeekday } from './next-occurrence';

/** Weeks the instructor can page ahead to, after the current one. */
export const WEEKS_AHEAD = 4;

function parts(dateKey: string): [number, number, number] {
  const [y, m, d] = dateKey.split('-').map(Number);
  return [y, m, d];
}

/** The 7 dates (Sunday first) of the week `weekOffset` weeks after the one containing `todayKey`. */
export function weekDates(todayKey: string, weekOffset: number): string[] {
  const [y, m, d] = parts(todayKey);
  const sunday = addDaysToDateKey(todayKey, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(sunday, weekOffset * 7 + i));
}

/** Whether a monthly nth-weekday series (started on `firstOccurrenceDate`) meets on `dateKey`. */
export function seriesMeetsOn(
  series: { dayOfWeek: number; nthWeekday: number; firstOccurrenceDate: string },
  dateKey: string
): boolean {
  if (dateKey < series.firstOccurrenceDate) return false;
  const [y, m, d] = parts(dateKey);
  return dateOfNthWeekday(y, m, series.dayOfWeek, series.nthWeekday) === d;
}

/** Week of the month a date belongs to: "2nd", "4th / Last" (day 22–28 that is also the last), "Last". */
export function weekOfMonthLabel(dateKey: string): string {
  const [y, m, d] = parts(dateKey);
  const nth = Math.ceil(d / 7);
  if (nth >= 5) return nthOrdinalLabel(-1);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return nth === 4 && d + 7 > daysInMonth ? '4th / Last' : nthOrdinalLabel(nth);
}
