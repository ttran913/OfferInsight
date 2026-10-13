import { seriesMeetsOn, weekDates, weekOfMonthLabel } from '../lib/calendar/week-schedule';

describe('weekDates', () => {
  it('returns the Sunday-first week containing today', () => {
    // 2026-10-06 is a Tuesday
    expect(weekDates('2026-10-06', 0)).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ]);
  });

  it('pages forward by whole weeks across month boundaries', () => {
    const week = weekDates('2026-10-06', 4);
    expect(week[0]).toBe('2026-11-01');
    expect(week[6]).toBe('2026-11-07');
  });
});

describe('seriesMeetsOn', () => {
  // 2nd Wednesday series starting 2026-10-14
  const secondWed = { dayOfWeek: 3, nthWeekday: 2, firstOccurrenceDate: '2026-10-14' };

  it('matches the nth weekday of each month', () => {
    expect(seriesMeetsOn(secondWed, '2026-10-14')).toBe(true);
    expect(seriesMeetsOn(secondWed, '2026-11-11')).toBe(true);
    expect(seriesMeetsOn(secondWed, '2026-10-21')).toBe(false);
  });

  it('ignores dates before the series starts', () => {
    expect(seriesMeetsOn({ ...secondWed, firstOccurrenceDate: '2026-11-11' }, '2026-10-14')).toBe(false);
  });

  it('places "Last" on the final weekday, even in a four-week month', () => {
    const lastWed = { dayOfWeek: 3, nthWeekday: -1, firstOccurrenceDate: '2026-09-30' };
    expect(seriesMeetsOn(lastWed, '2026-10-28')).toBe(true); // Oct has 4 Wednesdays
    expect(seriesMeetsOn(lastWed, '2026-10-21')).toBe(false);
  });
});

describe('weekOfMonthLabel', () => {
  it('labels ordinary weeks, shared 4th/Last, and 5th as Last', () => {
    expect(weekOfMonthLabel('2026-10-14')).toBe('2nd');
    expect(weekOfMonthLabel('2026-10-28')).toBe('4th / Last');
    expect(weekOfMonthLabel('2026-10-22')).toBe('4th');
    expect(weekOfMonthLabel('2026-10-29')).toBe('Last');
  });
});
