import { buildMonthlyMeetingIcs, buildMonthlyOccurrenceIcs } from '../lib/calendar/ics';
import { seriesAnchorSlot } from '../lib/calendar/next-occurrence';
import {
  findPendingSkip,
  nextAttendedOccurrence,
  normalizeSkipReason,
  planSkip,
  SKIP_REASON_MAX_LENGTH,
} from '../lib/calendar/skips';

// 2nd Wednesday at 10:00 Pacific, first meeting Wed 2026-06-10
const meeting = {
  weeklyKey: '3|10:00',
  dayOfWeek: 3,
  localTime: '10:00',
  timezone: 'America/Los_Angeles',
  firstOccurrence: new Date('2026-06-10T17:00:00.000Z'),
};
const JULY_8 = new Date('2026-07-08T17:00:00.000Z');
const now = new Date('2026-06-20T12:00:00.000Z');

describe('one-time meeting skips', () => {
  it('steps past a skipped date to the following month', () => {
    expect(nextAttendedOccurrence(meeting, [], now)?.localDate).toBe('2026-07-08');
    expect(
      nextAttendedOccurrence(meeting, [{ occurrenceStart: JULY_8 }], now)?.localDate
    ).toBe('2026-08-12');
  });

  it('plans a skip of the next upcoming meeting', () => {
    const plan = planSkip(meeting, [], now);
    expect(plan).toEqual({ ok: true, occurrenceStart: JULY_8 });
  });

  it('rejects a second skip while one is pending', () => {
    const plan = planSkip(meeting, [{ occurrenceStart: JULY_8 }], now);
    expect(plan.ok).toBe(false);
  });

  it('ignores skips whose meeting already happened', () => {
    const past = [{ occurrenceStart: meeting.firstOccurrence }];
    expect(findPendingSkip(past, now)).toBeNull();
    expect(planSkip(meeting, past, now)).toEqual({ ok: true, occurrenceStart: JULY_8 });
  });

  it('allows undo only until the meeting starts', () => {
    const skips = [{ occurrenceStart: JULY_8 }];
    expect(findPendingSkip(skips, new Date('2026-07-08T16:59:00.000Z'))).not.toBeNull();
    expect(findPendingSkip(skips, new Date('2026-07-08T17:00:00.000Z'))).toBeNull();
  });

  it('normalizes the optional reason', () => {
    expect(normalizeSkipReason('  sick  ')).toBe('sick');
    expect(normalizeSkipReason('   ')).toBeNull();
    expect(normalizeSkipReason(undefined)).toBeNull();
    expect(normalizeSkipReason('x'.repeat(SKIP_REASON_MAX_LENGTH + 50))).toHaveLength(
      SKIP_REASON_MAX_LENGTH
    );
  });
});

describe('single-date cancel/restore .ics', () => {
  const invite = {
    slot: seriesAnchorSlot(meeting),
    studentName: 'Sam',
    studentEmail: 'sam@example.com',
    instructorName: 'Coach',
  };
  const uidOf = (content: string) => /UID:(.+)\r\n/.exec(content)?.[1];

  it('cancels one date under the original series UID', () => {
    const series = buildMonthlyMeetingIcs(invite).content;
    const cancel = buildMonthlyOccurrenceIcs({
      ...invite,
      occurrenceStart: JULY_8.toISOString(),
      cancelled: true,
    }).content;

    expect(uidOf(cancel)).toBe(uidOf(series));
    expect(cancel).toContain('METHOD:CANCEL');
    expect(cancel).toContain('RECURRENCE-ID:20260708T170000Z');
    expect(cancel).toContain('DTSTART:20260708T170000Z');
    expect(cancel).toContain('STATUS:CANCELLED');
    expect(cancel).not.toContain('RRULE');
  });

  it('restores the date with a newer sequence', () => {
    const restore = buildMonthlyOccurrenceIcs({
      ...invite,
      occurrenceStart: JULY_8.toISOString(),
      cancelled: false,
    }).content;

    expect(restore).toContain('METHOD:REQUEST');
    expect(restore).toContain('STATUS:CONFIRMED');
    expect(restore).toContain('SEQUENCE:2');
  });
});
