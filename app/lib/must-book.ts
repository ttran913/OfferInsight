import { DEFAULT_AVAILABILITY_TIMEZONE } from '@/app/lib/calendar/constants';
import { formatNextMeetingLabel } from '@/app/lib/calendar/next-occurrence';

/** Why a student is on the "book a monthly 1:1" clock. */
export type MustBookReason = 'missedMeeting' | 'skippedOnboarding';

export const MUST_BOOK_WARNING_HOURS = 72;
export const MUST_BOOK_REMOVAL_HOURS = 96;
/** The cron runs daily; removal waits ~24h after the final warning, allowing an hour of drift. */
const MIN_HOURS_AFTER_WARNING = 23;

/** Accounts created on or after this must book (or skip) on onboarding page 4 before the dashboard. */
export const MEETING_STEP_REQUIRED_FROM = new Date('2026-10-13T07:00:00.000Z');

const HOUR_MS = 60 * 60 * 1000;

type BookingClock = {
  mustBookSince: Date | null;
  bookFinalWarningSentAt: Date | null;
};

export function isMustBookReason(value: string | null): value is MustBookReason {
  return value === 'missedMeeting' || value === 'skippedOnboarding';
}

/** Where a student on the clock stands; null when they're not on one. */
export function bookingStage(
  clock: BookingClock,
  now = new Date()
): 'waiting' | 'finalWarning' | 'remove' | null {
  const since = clock.mustBookSince?.getTime();
  if (since === undefined) return null;
  const warned = clock.bookFinalWarningSentAt?.getTime();
  if (warned === undefined) {
    return now.getTime() >= since + MUST_BOOK_WARNING_HOURS * HOUR_MS ? 'finalWarning' : 'waiting';
  }
  const removable =
    now.getTime() >= since + MUST_BOOK_REMOVAL_HOURS * HOUR_MS &&
    now.getTime() >= warned + MIN_HOURS_AFTER_WARNING * HOUR_MS;
  return removable ? 'remove' : 'waiting';
}

/** Book-by deadline given in the first email: 72 hours after the clock starts. */
export function bookByDate(since: Date): Date {
  return new Date(since.getTime() + MUST_BOOK_WARNING_HOURS * HOUR_MS);
}

/** When removal happens: the next daily run after the final warning, and never before 96 hours. */
export function removeByDate(clock: { mustBookSince: Date; bookFinalWarningSentAt: Date }): Date {
  return new Date(
    Math.max(
      clock.mustBookSince.getTime() + MUST_BOOK_REMOVAL_HOURS * HOUR_MS,
      clock.bookFinalWarningSentAt.getTime() + 24 * HOUR_MS
    )
  );
}

/** The current deadline to show: book-by before the final warning, remove-by after it. */
export function currentDeadline(clock: { mustBookSince: Date; bookFinalWarningSentAt: Date | null }): Date {
  return clock.bookFinalWarningSentAt
    ? removeByDate({ ...clock, bookFinalWarningSentAt: clock.bookFinalWarningSentAt })
    : bookByDate(clock.mustBookSince);
}

/** Deadline (or missed-meeting) label in the instructors' timezone, e.g. "Saturday, October 17, 2026 at 2:15 PM PDT". */
export function deadlineLabel(date: Date): string {
  return formatNextMeetingLabel(date.toISOString(), DEFAULT_AVAILABILITY_TIMEZONE);
}

/** User fields that start the clock (spread into a prisma user update). */
export function startedBookingClock(reason: MustBookReason, now = new Date()) {
  return { mustBookSince: now, mustBookReason: reason, bookFinalWarningSentAt: null };
}

/** User fields that stop the clock (spread into a prisma user update). */
export const CLEARED_BOOKING_CLOCK = {
  mustBookSince: null,
  mustBookReason: null,
  bookFinalWarningSentAt: null,
};

/** New students who reached onboarding page 4 must book or skip before using the dashboard. */
export function mustFinishBookingStep(user: {
  createdAt: Date;
  onboardingProgress: number;
  hasMeeting: boolean;
}): boolean {
  return (
    user.onboardingProgress === 3 &&
    !user.hasMeeting &&
    user.createdAt.getTime() >= MEETING_STEP_REQUIRED_FROM.getTime()
  );
}
