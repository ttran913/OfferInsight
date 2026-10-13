import { monthlySeriesStarts, seriesConflict } from '../lib/calendar/conflicts';
import { generateAvailableSlots } from '../lib/calendar/slots';

const tz = 'America/Los_Angeles';
// Monday 2026-06-08 08:00 PDT
const now = new Date('2026-06-08T15:00:00.000Z');
// Wednesdays 10:00–10:20 only → one weekly time "3|10:00"
const slots = generateAvailableSlots({
  windows: [{ dayOfWeek: 3, startTime: '10:00', endTime: '10:20' }],
  timezone: tz,
  durationMinutes: 20,
  days: 42,
  now,
});
const jun10 = slots[0];

describe('seriesConflict', () => {
  it('is null when the next three monthly meetings are free', () => {
    expect(seriesConflict(jun10, [], 20)).toBeNull();
  });

  it('reports a conflict on a later meeting in the series', () => {
    // Series from 2026-06-10 (2nd Wed) → Jul 8, Aug 12. Block Jul 8.
    const busy = [{ start: '2026-07-08T17:00:00.000Z', end: '2026-07-08T17:20:00.000Z', title: 'Trip' }];
    expect(seriesConflict(jun10, busy, 20)).toEqual({ start: '2026-07-08T17:00:00.000Z', title: 'Trip' });
  });

  it('treats back-to-back events as non-overlapping', () => {
    const busy = [{ start: '2026-06-10T16:00:00.000Z', end: '2026-06-10T17:00:00.000Z', title: 'Standup' }];
    expect(seriesConflict(jun10, busy, 20)).toBeNull();
  });
});

describe('monthlySeriesStarts', () => {
  it('follows the nth-weekday pattern across months', () => {
    // 2026-06-10 is the 2nd Wednesday → Jul 8, Aug 12
    expect(monthlySeriesStarts(jun10, 3).map((ms) => new Date(ms).toISOString())).toEqual([
      '2026-06-10T17:00:00.000Z',
      '2026-07-08T17:00:00.000Z',
      '2026-08-12T17:00:00.000Z',
    ]);
  });
});
