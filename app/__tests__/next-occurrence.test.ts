import {
  getNextMonthlyOccurrence,
  formatNextMeetingLabel,
} from '../lib/calendar/next-occurrence';

describe('next monthly occurrence', () => {
  const tz = 'America/Los_Angeles';

  it('returns the same nth weekday in a later month', () => {
    // Anchor: Wed 2026-06-10 = 2nd Wednesday
    const now = new Date('2026-06-11T17:00:00.000Z'); // after that Wednesday
    const next = getNextMonthlyOccurrence({
      dayOfWeek: 3,
      localTime: '10:00',
      timezone: tz,
      anchorLocalDate: '2026-06-10',
      now,
    });
    expect(next?.localDate).toBe('2026-07-08'); // 2nd Wed of July 2026
    expect(next?.localTime).toBe('10:00');
  });

  it('formats a readable label', () => {
    const label = formatNextMeetingLabel('2026-07-08T17:00:00.000Z', tz);
    expect(label).toContain('July');
    expect(label).toContain('2026');
    expect(label).toMatch(/Wednesday/);
  });
});
