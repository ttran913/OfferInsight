import {
  buildMonthGrid,
  groupEventsByLocalDate,
  type CalendarEventItem,
} from '../lib/calendar/month-grid';

function event(partial: Partial<CalendarEventItem>): CalendarEventItem {
  return {
    id: 'e1',
    title: 'Event',
    start: '2026-10-07T17:00:00.000Z',
    end: null,
    allDay: false,
    location: null,
    htmlLink: null,
    meetLink: null,
    ...partial,
  };
}

describe('month grid', () => {
  const tz = 'America/Los_Angeles';

  it('pads a month that starts mid-week with adjacent-month days', () => {
    // October 2026 starts on a Thursday and has 31 days → 5 Sunday-first weeks
    const weeks = buildMonthGrid(2026, 10);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ dateKey: '2026-09-27', day: 27, inMonth: false });
    expect(weeks[0][4]).toEqual({ dateKey: '2026-10-01', day: 1, inMonth: true });
    expect(weeks[4][6]).toEqual({ dateKey: '2026-10-31', day: 31, inMonth: true });
  });

  it('places a multi-day all-day event on every day it spans (end exclusive)', () => {
    const byDay = groupEventsByLocalDate(
      [event({ id: 'trip', allDay: true, start: '2026-10-09', end: '2026-10-12' })],
      tz
    );
    expect([...byDay.keys()].sort()).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
  });

  it('buckets a late-evening Pacific event on its local day, not the UTC day', () => {
    // 2026-10-07 23:30 PDT = 2026-10-08 06:30 UTC
    const byDay = groupEventsByLocalDate(
      [event({ id: 'late', start: '2026-10-08T06:30:00.000Z', end: '2026-10-08T07:00:00.000Z' })],
      tz
    );
    expect(byDay.get('2026-10-07')?.map((e) => e.id)).toEqual(['late']);
    expect(byDay.has('2026-10-08')).toBe(false);
  });

  it('sorts all-day events before timed events within a day', () => {
    const byDay = groupEventsByLocalDate(
      [
        event({ id: 'timed', start: '2026-10-07T17:00:00.000Z' }),
        event({ id: 'allday', allDay: true, start: '2026-10-07', end: '2026-10-08' }),
      ],
      tz
    );
    expect(byDay.get('2026-10-07')?.map((e) => e.id)).toEqual(['allday', 'timed']);
  });
});
