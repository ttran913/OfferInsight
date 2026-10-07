import {
  bookingWindowEnd,
  bookingWindowSlots,
  findBookableDays,
  weeksCollide,
  type BookedSeries,
} from '../lib/calendar/bookable-days';
import { followingMonthlyLocalDate } from '../lib/calendar/next-occurrence';

const tz = 'America/Los_Angeles';
// Monday 2026-06-08 08:00 PDT. June Wednesdays: 3, 10, 17, 24. July: 1, 8, 15, 22, 29.
const now = new Date('2026-06-08T15:00:00.000Z');
const slots = bookingWindowSlots({
  windows: [{ dayOfWeek: 3, startTime: '10:00', endTime: '10:20' }],
  timezone: tz,
  durationMinutes: 20,
  now,
});

function bookableDates(booked: BookedSeries[] = [], busy: { start: string; end: string; title: string }[] = []) {
  return findBookableDays({ slots, busy, booked, durationMinutes: 20 }).map((d) => d.localDate);
}

describe('booking window', () => {
  it('runs until the first day of the month after next', () => {
    expect(bookingWindowEnd(now, tz).toISOString()).toBe('2026-08-01T07:00:00.000Z');
  });

  it('includes every remaining date this month and next', () => {
    expect(slots.map((s) => s.localDate)).toEqual([
      '2026-06-10',
      '2026-06-17',
      '2026-06-24',
      '2026-07-01',
      '2026-07-08',
      '2026-07-15',
      '2026-07-22',
      '2026-07-29',
    ]);
  });
});

describe('weeksCollide', () => {
  it('collides the same week, and 4th with Last', () => {
    expect(weeksCollide(2, 2)).toBe(true);
    expect(weeksCollide(4, -1)).toBe(true);
    expect(weeksCollide(-1, 4)).toBe(true);
    expect(weeksCollide(2, 4)).toBe(false);
    expect(weeksCollide(3, -1)).toBe(false);
  });
});

describe('findBookableDays', () => {
  it('labels each date with its week of the month', () => {
    const days = findBookableDays({ slots, busy: [], booked: [], durationMinutes: 20 });
    expect(days.find((d) => d.localDate === '2026-06-10')?.nthWeekday).toBe(2);
    expect(days.find((d) => d.localDate === '2026-07-29')?.nthWeekday).toBe(-1);
  });

  it('lets another week share a weekday and time', () => {
    // Someone has the 2nd Wednesday at 10:00 → only 2nd-Wednesday dates are taken.
    expect(bookableDates([{ weeklyKey: '3|10:00', nthWeekday: 2 }])).toEqual([
      '2026-06-17',
      '2026-06-24',
      '2026-07-01',
      '2026-07-15',
      '2026-07-22',
      '2026-07-29',
    ]);
  });

  it('treats 4th and Last as the same slot', () => {
    const expected = ['2026-06-10', '2026-06-17', '2026-07-01', '2026-07-08', '2026-07-15'];
    expect(bookableDates([{ weeklyKey: '3|10:00', nthWeekday: 4 }])).toEqual(expected);
    expect(bookableDates([{ weeklyKey: '3|10:00', nthWeekday: -1 }])).toEqual(expected);
  });

  it('ignores bookings at other times', () => {
    expect(bookableDates([{ weeklyKey: '3|10:20', nthWeekday: 2 }])).toHaveLength(8);
  });

  it('hides dates whose series hits a Google conflict', () => {
    // Busy Jul 8 → rules out Jun 10 (2nd Wed series: Jun 10, Jul 8, Aug 12) and Jul 8 itself.
    const busy = [{ start: '2026-07-08T17:00:00.000Z', end: '2026-07-08T17:20:00.000Z', title: 'Trip' }];
    const dates = bookableDates([], busy);
    expect(dates).not.toContain('2026-06-10');
    expect(dates).not.toContain('2026-07-08');
    expect(dates).toContain('2026-06-17');
  });
});

describe('followingMonthlyLocalDate', () => {
  it('returns the same week and weekday next month', () => {
    expect(followingMonthlyLocalDate('2026-06-10')).toBe('2026-07-08');
    expect(followingMonthlyLocalDate('2026-07-29')).toBe('2026-08-26');
    expect(followingMonthlyLocalDate('2026-12-09')).toBe('2027-01-13');
  });
});
