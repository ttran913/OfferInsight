import { buildMonthlyMeetingIcs, buildMovedOccurrenceIcs } from '../lib/calendar/ics';
import {
  findOneTimeSlots,
  meetingStartsBetween,
  nextMeeting,
  oneTimeMoveTarget,
} from '../lib/calendar/moves';
import { seriesAnchorSlot } from '../lib/calendar/next-occurrence';

// 2nd Wednesday at 10:00 Pacific, first meeting Wed 2026-06-10
const meeting = {
  weeklyKey: '3|10:00',
  dayOfWeek: 3,
  localTime: '10:00',
  timezone: 'America/Los_Angeles',
  firstOccurrence: new Date('2026-06-10T17:00:00.000Z'),
};
const JULY_8 = new Date('2026-07-08T17:00:00.000Z');
const AUG_12 = new Date('2026-08-12T17:00:00.000Z');
// Mon Jul 6, 2:00 PM PDT and Fri Jul 10, 2:00 PM PDT
const JULY_6_2PM = new Date('2026-07-06T21:00:00.000Z');
const JULY_10_2PM = new Date('2026-07-10T21:00:00.000Z');
const now = new Date('2026-06-20T12:00:00.000Z');

describe('nextMeeting', () => {
  it('is the next regular date when nothing was moved', () => {
    expect(nextMeeting(meeting, [], now)).toEqual({
      startIso: JULY_8.toISOString(),
      localDate: '2026-07-08',
      localTime: '10:00',
      movedFrom: null,
    });
  });

  it('is the new time of a meeting moved earlier', () => {
    const moves = [{ originalStart: JULY_8, newStart: JULY_6_2PM }];
    expect(nextMeeting(meeting, moves, now)).toEqual({
      startIso: JULY_6_2PM.toISOString(),
      localDate: '2026-07-06',
      localTime: '14:00',
      movedFrom: JULY_8.toISOString(),
    });
  });

  it('is the new time of a meeting moved later, even after the original time passes', () => {
    const moves = [{ originalStart: JULY_8, newStart: JULY_10_2PM }];
    expect(nextMeeting(meeting, moves, now)?.localDate).toBe('2026-07-10');
    const july9 = new Date('2026-07-09T12:00:00.000Z');
    expect(nextMeeting(meeting, moves, july9)?.movedFrom).toBe(JULY_8.toISOString());
  });

  it('returns to the regular schedule once the moved meeting happened', () => {
    const moves = [{ originalStart: JULY_8, newStart: JULY_10_2PM }];
    const july11 = new Date('2026-07-11T12:00:00.000Z');
    expect(nextMeeting(meeting, moves, july11)).toMatchObject({
      startIso: AUG_12.toISOString(),
      movedFrom: null,
    });
  });

  it('ignores matching weekdays before the series starts', () => {
    const julySeries = { ...meeting, firstOccurrence: JULY_8 };
    const june1 = new Date('2026-06-01T12:00:00.000Z');
    expect(nextMeeting(julySeries, [], june1)?.localDate).toBe('2026-07-08');
  });
});

describe('oneTimeMoveTarget', () => {
  it('targets the next regular date, with a window up to the following meeting day', () => {
    const target = oneTimeMoveTarget(meeting, [], now);
    expect(target).toEqual({
      originalStart: JULY_8,
      move: null,
      followingStart: AUG_12,
      // Midnight PDT starting Aug 12
      windowEnd: new Date('2026-08-12T07:00:00.000Z'),
    });
  });

  it('keeps targeting the original date when changing a move again', () => {
    const move = { originalStart: JULY_8, newStart: JULY_10_2PM };
    const target = oneTimeMoveTarget(meeting, [move], now);
    expect(target?.originalStart).toEqual(JULY_8);
    expect(target?.move).toBe(move);
    expect(target?.followingStart).toEqual(AUG_12);
  });

  it('moves on to the following date after the moved meeting happened', () => {
    const move = { originalStart: JULY_8, newStart: JULY_10_2PM };
    const target = oneTimeMoveTarget(meeting, [move], new Date('2026-07-11T12:00:00.000Z'));
    expect(target?.originalStart).toEqual(AUG_12);
    expect(target?.move).toBeNull();
  });
});

describe('meetingStartsBetween', () => {
  it('counts a moved meeting at its new time, not its original one', () => {
    const moves = [{ originalStart: JULY_8, newStart: JULY_10_2PM }];
    const starts = meetingStartsBetween(meeting, moves, now, new Date('2026-09-01T00:00:00.000Z'));
    expect(starts).toEqual([JULY_10_2PM.getTime(), AUG_12.getTime()]);
  });
});

describe('findOneTimeSlots', () => {
  const july1 = new Date('2026-07-01T12:00:00.000Z');
  const windows = [
    { dayOfWeek: 3, startTime: '10:00', endTime: '10:40' },
    { dayOfWeek: 5, startTime: '14:00', endTime: '14:40' },
  ];
  const base = {
    windows,
    timezone: meeting.timezone,
    now: july1,
    windowEnd: new Date('2026-08-12T07:00:00.000Z'),
    busy: [],
    taken: [],
    excludeStarts: [],
  };
  const timesOn = (days: ReturnType<typeof findOneTimeSlots>, date: string) =>
    days.find((d) => d.localDate === date)?.slots.map((s) => s.localTime) ?? [];

  it('offers open times from now until the following meeting day', () => {
    const days = findOneTimeSlots(base);
    expect(days[0].localDate).toBe('2026-07-01');
    expect(days.at(-1)?.localDate).toBe('2026-08-07');
    expect(timesOn(days, '2026-08-12')).toEqual([]);
  });

  it("excludes the student's own original time", () => {
    const days = findOneTimeSlots({ ...base, excludeStarts: [JULY_8] });
    expect(timesOn(days, '2026-07-08')).toEqual(['10:20']);
  });

  it('excludes Google busy times', () => {
    const busy = [
      { start: '2026-07-10T21:00:00.000Z', end: '2026-07-10T21:20:00.000Z', title: 'Dentist' },
    ];
    const days = findOneTimeSlots({ ...base, busy });
    expect(timesOn(days, '2026-07-10')).toEqual(['14:20']);
  });

  it("excludes another student's meeting", () => {
    const taken = [new Date('2026-07-15T17:20:00.000Z').getTime()];
    const days = findOneTimeSlots({ ...base, taken });
    expect(timesOn(days, '2026-07-15')).toEqual(['10:00']);
  });
});

describe('moved-occurrence .ics', () => {
  const invite = {
    slot: seriesAnchorSlot(meeting),
    studentName: 'Sam',
    studentEmail: 'sam@example.com',
    instructorName: 'Coach',
  };
  const uidOf = (content: string) => /UID:(.+)\r\n/.exec(content)?.[1];
  const sequenceOf = (content: string) => Number(/SEQUENCE:(\d+)/.exec(content)?.[1]);

  afterEach(() => {
    jest.useRealTimers();
  });

  it('moves one date under the original series UID', () => {
    const series = buildMonthlyMeetingIcs(invite).content;
    const moved = buildMovedOccurrenceIcs({
      ...invite,
      originalStart: JULY_8.toISOString(),
      newStart: JULY_10_2PM.toISOString(),
    }).content;

    expect(uidOf(moved)).toBe(uidOf(series));
    expect(moved).toContain('METHOD:REQUEST');
    expect(moved).toContain('RECURRENCE-ID:20260708T170000Z');
    expect(moved).toContain('DTSTART:20260710T210000Z');
    expect(moved).toContain('DTEND:20260710T212000Z');
    expect(moved).not.toContain('RRULE');
  });

  it('restores the original time with a newer sequence', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-20T12:00:00.000Z'));
    const moved = buildMovedOccurrenceIcs({
      ...invite,
      originalStart: JULY_8.toISOString(),
      newStart: JULY_10_2PM.toISOString(),
    }).content;
    jest.setSystemTime(new Date('2026-06-21T12:00:00.000Z'));
    const restored = buildMovedOccurrenceIcs({
      ...invite,
      originalStart: JULY_8.toISOString(),
      newStart: JULY_8.toISOString(),
    }).content;

    expect(restored).toContain('RECURRENCE-ID:20260708T170000Z');
    expect(restored).toContain('DTSTART:20260708T170000Z');
    expect(sequenceOf(restored)).toBeGreaterThan(sequenceOf(moved));
  });
});
