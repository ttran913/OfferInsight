import { occurrenceNeedingReminder } from '../lib/calendar/reminders';

// 2nd Wednesday at 10:00 Pacific, first meeting Wed 2026-06-10
const meeting = {
  dayOfWeek: 3,
  localTime: '10:00',
  timezone: 'America/Los_Angeles',
  firstOccurrence: new Date('2026-06-10T17:00:00.000Z'),
  lastReminderFor: null,
};
const JULY_8 = new Date('2026-07-08T17:00:00.000Z');
// Cron run: 9 AM PDT the day before
const JULY_7_RUN = new Date('2026-07-07T16:00:00.000Z');

describe('occurrenceNeedingReminder', () => {
  it('returns the meeting when it is tomorrow', () => {
    expect(occurrenceNeedingReminder(meeting, [], JULY_7_RUN)?.startIso).toBe(JULY_8.toISOString());
  });

  it('uses the meeting timezone, not UTC, to decide what tomorrow is', () => {
    // 7 PM PDT on Jul 7 is already Jul 8 in UTC
    const evening = new Date('2026-07-08T02:00:00.000Z');
    expect(occurrenceNeedingReminder(meeting, [], evening)?.localDate).toBe('2026-07-08');
  });

  it('skips meetings today or more than a day away', () => {
    expect(occurrenceNeedingReminder(meeting, [], new Date('2026-07-08T16:00:00.000Z'))).toBeNull();
    expect(occurrenceNeedingReminder(meeting, [], new Date('2026-07-06T16:00:00.000Z'))).toBeNull();
  });

  it('does not remind for a skipped date', () => {
    expect(occurrenceNeedingReminder(meeting, [{ occurrenceStart: JULY_8 }], JULY_7_RUN)).toBeNull();
  });

  it('does not remind twice for the same meeting', () => {
    expect(occurrenceNeedingReminder({ ...meeting, lastReminderFor: JULY_8 }, [], JULY_7_RUN)).toBeNull();
    // An older reminder doesn't block this month's
    expect(
      occurrenceNeedingReminder({ ...meeting, lastReminderFor: meeting.firstOccurrence }, [], JULY_7_RUN)
    ).not.toBeNull();
  });

  it('does not remind before the series starts', () => {
    const augustSeries = { ...meeting, firstOccurrence: new Date('2026-08-12T17:00:00.000Z') };
    expect(occurrenceNeedingReminder(augustSeries, [], JULY_7_RUN)).toBeNull();
  });

  it('follows a "Last" weekday series into a four-week month', () => {
    // Last Wednesday: Jul 29 → Aug 26
    const lastWed = { ...meeting, firstOccurrence: new Date('2026-07-29T17:00:00.000Z') };
    const run = new Date('2026-08-25T16:00:00.000Z');
    expect(occurrenceNeedingReminder(lastWed, [], run)?.localDate).toBe('2026-08-26');
  });
});
