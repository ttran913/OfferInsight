import {
  generateAvailableSlots,
  uniqueWeeklyKeys,
  zonedWallTimeToUtc,
  getZonedParts,
} from '../lib/calendar/slots';
import { slotStartTimesInWindow, validateAvailabilityWindows } from '../lib/calendar/constants';

describe('calendar slots', () => {
  const tz = 'America/Los_Angeles';

  it('converts wall time in America/Los_Angeles to a stable UTC instant', () => {
    // 2026-06-10 10:00 PDT (UTC-7) => 17:00 UTC
    const utc = zonedWallTimeToUtc(2026, 6, 10, 10, 0, tz);
    expect(utc.toISOString()).toBe('2026-06-10T17:00:00.000Z');
    const parts = getZonedParts(utc, tz);
    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(0);
    expect(parts.dayOfWeek).toBe(3); // Wednesday
  });

  it('generates 20-min slots inside a Wednesday window', () => {
    // Wednesday 2026-06-10
    const now = new Date('2026-06-10T15:00:00.000Z'); // before 10:00 PDT
    const slots = generateAvailableSlots({
      windows: [{ dayOfWeek: 3, startTime: '10:00', endTime: '11:00' }],
      rangeStart: now,
      days: 1,
      now,
      timezone: tz,
    });

    expect(slots.map((s) => s.localTime)).toEqual(['10:00', '10:20', '10:40']);
    expect(slots.every((s) => s.dayOfWeek === 3)).toBe(true);
    expect(slots[0].weeklyKey).toBe('3|10:00');
    expect(slots[0].end).toBe('2026-06-10T17:20:00.000Z');
  });

  it('excludes occupied weekly keys', () => {
    const now = new Date('2026-06-10T15:00:00.000Z');
    const slots = generateAvailableSlots({
      windows: [{ dayOfWeek: 3, startTime: '10:00', endTime: '11:00' }],
      rangeStart: now,
      days: 1,
      now,
      timezone: tz,
      occupied: [{ weeklyKey: '3|10:20' }],
    });

    expect(slots.map((s) => s.localTime)).toEqual(['10:00', '10:40']);
  });

  it('uniqueWeeklyKeys keeps first occurrence of each standing time', () => {
    const now = new Date('2026-06-10T15:00:00.000Z');
    const slots = generateAvailableSlots({
      windows: [{ dayOfWeek: 3, startTime: '10:00', endTime: '10:40' }],
      rangeStart: now,
      days: 14,
      now,
      timezone: tz,
    });
    const unique = uniqueWeeklyKeys(slots);
    expect(unique.map((s) => s.weeklyKey).sort()).toEqual(['3|10:00', '3|10:20']);
  });

  it('slotStartTimesInWindow drops a trailing partial slot', () => {
    expect(slotStartTimesInWindow('10:00', '11:10', 20)).toEqual(['10:00', '10:20', '10:40']);
    expect(slotStartTimesInWindow('10:00', '10:15', 20)).toEqual([]);
  });

  it('rejects overlapping ranges on the same day only', () => {
    expect(
      validateAvailabilityWindows([
        { dayOfWeek: 3, startTime: '10:00', endTime: '12:00' },
        { dayOfWeek: 3, startTime: '11:00', endTime: '13:00' },
      ])
    ).toBe('Time ranges overlap on Wednesday.');
    expect(
      validateAvailabilityWindows([
        { dayOfWeek: 3, startTime: '10:00', endTime: '12:00' },
        { dayOfWeek: 3, startTime: '12:00', endTime: '13:00' },
        { dayOfWeek: 4, startTime: '11:00', endTime: '13:00' },
      ])
    ).toBeNull();
  });
});
