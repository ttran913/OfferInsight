import { monthlySeriesStarts, resolveStandingTimes } from '../lib/calendar/conflicts';
import { generateAvailableSlots } from '../lib/calendar/slots';

describe('resolveStandingTimes', () => {
  const tz = 'America/Los_Angeles';
  // Monday 2026-06-08 08:00 PDT
  const now = new Date('2026-06-08T15:00:00.000Z');
  // Wednesdays 10:00–10:20 only → one standing time "3|10:00"
  const slots = generateAvailableSlots({
    windows: [{ dayOfWeek: 3, startTime: '10:00', endTime: '10:20' }],
    timezone: tz,
    durationMinutes: 20,
    days: 42,
    now,
  });

  function resolve(busy: { start: string; end: string; title: string }[]) {
    return resolveStandingTimes({ slots, busy, durationMinutes: 20 });
  }

  it('uses the first upcoming week when nothing conflicts', () => {
    const { anchors, blocked, shifted } = resolve([]);
    expect(anchors.get('3|10:00')?.localDate).toBe('2026-06-10');
    expect(blocked.size).toBe(0);
    expect(shifted.size).toBe(0);
  });

  it('shifts the start past a one-off conflict on the first meeting', () => {
    // Wed 2026-06-10 10:00 PDT is busy → next Wednesday works
    const { anchors, shifted } = resolve([
      { start: '2026-06-10T17:00:00.000Z', end: '2026-06-10T17:30:00.000Z', title: 'Dentist' },
    ]);
    expect(anchors.get('3|10:00')?.localDate).toBe('2026-06-17');
    expect(shifted.get('3|10:00')?.title).toBe('Dentist');
  });

  it('shifts when a later monthly meeting in the series conflicts', () => {
    // Series from 2026-06-10 (2nd Wed) → Jul 8, Aug 12. Block Jul 8.
    const { anchors } = resolve([
      { start: '2026-07-08T17:00:00.000Z', end: '2026-07-08T17:20:00.000Z', title: 'Trip' },
    ]);
    expect(anchors.get('3|10:00')?.localDate).toBe('2026-06-17');
  });

  it('blocks a time when every candidate week conflicts (weekly recurring meeting)', () => {
    const busy = Array.from({ length: 16 }, (_, i) => {
      const start = new Date(Date.parse('2026-06-10T17:00:00.000Z') + i * 7 * 86400000);
      return {
        start: start.toISOString(),
        end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
        title: 'Team sync',
      };
    });
    const { anchors, blocked } = resolve(busy);
    expect(anchors.has('3|10:00')).toBe(false);
    expect(blocked.get('3|10:00')).toEqual({ start: '2026-06-10T17:00:00.000Z', title: 'Team sync' });
  });

  it('treats back-to-back events as non-overlapping', () => {
    const { anchors, shifted } = resolve([
      { start: '2026-06-10T16:00:00.000Z', end: '2026-06-10T17:00:00.000Z', title: 'Standup' },
    ]);
    expect(anchors.get('3|10:00')?.localDate).toBe('2026-06-10');
    expect(shifted.size).toBe(0);
  });
});

describe('monthlySeriesStarts', () => {
  it('follows the nth-weekday pattern across months', () => {
    const [anchor] = generateAvailableSlots({
      windows: [{ dayOfWeek: 3, startTime: '10:00', endTime: '10:20' }],
      timezone: 'America/Los_Angeles',
      durationMinutes: 20,
      days: 7,
      now: new Date('2026-06-08T15:00:00.000Z'),
    });
    // 2026-06-10 is the 2nd Wednesday → Jul 8, Aug 12
    expect(monthlySeriesStarts(anchor, 3).map((ms) => new Date(ms).toISOString())).toEqual([
      '2026-06-10T17:00:00.000Z',
      '2026-07-08T17:00:00.000Z',
      '2026-08-12T17:00:00.000Z',
    ]);
  });
});
