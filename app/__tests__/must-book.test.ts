import { previousMeeting } from '../lib/calendar/moves';
import {
  bookByDate,
  bookingStage,
  currentDeadline,
  MEETING_STEP_REQUIRED_FROM,
  mustFinishBookingStep,
  removeByDate,
} from '../lib/must-book';

const HOUR = 60 * 60 * 1000;
const since = new Date('2026-07-01T16:30:00.000Z');
const at = (hours: number) => new Date(since.getTime() + hours * HOUR);

describe('bookingStage', () => {
  it('is null without a clock', () => {
    expect(bookingStage({ mustBookSince: null, bookFinalWarningSentAt: null }, at(200))).toBeNull();
  });

  it('waits until 72 hours, then sends the final warning', () => {
    const clock = { mustBookSince: since, bookFinalWarningSentAt: null };
    expect(bookingStage(clock, at(71.9))).toBe('waiting');
    expect(bookingStage(clock, at(72))).toBe('finalWarning');
    expect(bookingStage(clock, at(150))).toBe('finalWarning');
  });

  it('removes at 96 hours, only after the final warning', () => {
    const clock = { mustBookSince: since, bookFinalWarningSentAt: at(72) };
    expect(bookingStage(clock, at(95.9))).toBe('waiting');
    expect(bookingStage(clock, at(96))).toBe('remove');
  });

  it('waits about a day after a late final warning', () => {
    const clock = { mustBookSince: since, bookFinalWarningSentAt: at(100) };
    expect(bookingStage(clock, at(110))).toBe('waiting');
    expect(bookingStage(clock, at(123))).toBe('remove');
  });
});

describe('deadlines', () => {
  it('books by 72 hours, then is removed by the later of 96 hours and warning + 24h', () => {
    expect(bookByDate(since)).toEqual(at(72));
    expect(removeByDate({ mustBookSince: since, bookFinalWarningSentAt: at(72) })).toEqual(at(96));
    expect(removeByDate({ mustBookSince: since, bookFinalWarningSentAt: at(80) })).toEqual(at(104));
  });

  it('shows the book-by date until the final warning', () => {
    expect(currentDeadline({ mustBookSince: since, bookFinalWarningSentAt: null })).toEqual(at(72));
    expect(currentDeadline({ mustBookSince: since, bookFinalWarningSentAt: at(72) })).toEqual(at(96));
  });
});

describe('mustFinishBookingStep', () => {
  const newAccount = new Date(MEETING_STEP_REQUIRED_FROM.getTime() + HOUR);
  const oldAccount = new Date(MEETING_STEP_REQUIRED_FROM.getTime() - HOUR);

  it('sends new accounts at progress 3 without a meeting back to the booking page', () => {
    expect(mustFinishBookingStep({ createdAt: newAccount, onboardingProgress: 3, hasMeeting: false })).toBe(true);
  });

  it('leaves existing accounts, booked students, and finished onboarding alone', () => {
    expect(mustFinishBookingStep({ createdAt: oldAccount, onboardingProgress: 3, hasMeeting: false })).toBe(false);
    expect(mustFinishBookingStep({ createdAt: newAccount, onboardingProgress: 3, hasMeeting: true })).toBe(false);
    expect(mustFinishBookingStep({ createdAt: newAccount, onboardingProgress: 4, hasMeeting: false })).toBe(false);
  });
});

describe('previousMeeting', () => {
  // 2nd Wednesday at 10:00 Pacific, first meeting Wed 2026-06-10
  const meeting = {
    weeklyKey: '3|10:00',
    dayOfWeek: 3,
    localTime: '10:00',
    timezone: 'America/Los_Angeles',
    firstOccurrence: new Date('2026-06-10T17:00:00.000Z'),
  };
  const JUNE_10 = new Date('2026-06-10T17:00:00.000Z');
  const JULY_8 = new Date('2026-07-08T17:00:00.000Z');

  it('is null before the first meeting ends', () => {
    expect(previousMeeting(meeting, [], new Date('2026-06-10T17:10:00.000Z'))).toBeNull();
  });

  it('is the most recent meeting that already ended', () => {
    expect(previousMeeting(meeting, [], new Date('2026-07-08T17:10:00.000Z'))).toEqual(JUNE_10);
    expect(previousMeeting(meeting, [], new Date('2026-07-08T17:20:00.000Z'))).toEqual(JULY_8);
    expect(previousMeeting(meeting, [], new Date('2026-08-01T00:00:00.000Z'))).toEqual(JULY_8);
  });

  it('uses the moved time of a meeting moved one time', () => {
    const JULY_10_2PM = new Date('2026-07-10T21:00:00.000Z');
    const moves = [{ originalStart: JULY_8, newStart: JULY_10_2PM }];
    expect(previousMeeting(meeting, moves, new Date('2026-07-09T00:00:00.000Z'))).toEqual(JUNE_10);
    expect(previousMeeting(meeting, moves, new Date('2026-07-11T00:00:00.000Z'))).toEqual(JULY_10_2PM);
  });
});
