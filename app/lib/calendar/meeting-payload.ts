import { nthWeekdayForLocalDate } from './ics';
import {
  anchorLocalDateFromOccurrence,
  formatMonthlyScheduleLabel,
  formatNextMeetingLabel,
} from './next-occurrence';
import { findPendingSkip, nextAttendedOccurrence } from './skips';

/** A student's monthly meeting as returned to the student UI. */
export function meetingPayload(
  m: {
    dayOfWeek: number;
    localTime: string;
    timezone: string;
    firstOccurrence: Date;
  },
  skips: { occurrenceStart: Date; reason: string | null }[] = []
) {
  const anchorLocalDate = anchorLocalDateFromOccurrence(m.firstOccurrence, m.timezone);
  const next = nextAttendedOccurrence(m, skips);
  const following = next
    ? nextAttendedOccurrence(m, skips, new Date(new Date(next.startIso).getTime() + 1))
    : null;
  const pendingSkip = findPendingSkip(skips);
  const nthWeekday = nthWeekdayForLocalDate(anchorLocalDate);

  return {
    dayOfWeek: m.dayOfWeek,
    nthWeekday,
    scheduleLabel: formatMonthlyScheduleLabel(nthWeekday, m.dayOfWeek, m.localTime),
    localTime: m.localTime,
    timezone: m.timezone,
    nextOccurrenceDate: next?.localDate ?? null,
    nextOccurrenceLabel: next ? formatNextMeetingLabel(next.startIso, m.timezone) : null,
    /** The meeting after the next one (what "next" becomes if the student skips). */
    followingOccurrenceLabel: following
      ? formatNextMeetingLabel(following.startIso, m.timezone)
      : null,
    skippedOccurrence: pendingSkip
      ? {
          start: pendingSkip.occurrenceStart.toISOString(),
          label: formatNextMeetingLabel(pendingSkip.occurrenceStart.toISOString(), m.timezone),
          reason: pendingSkip.reason,
        }
      : null,
  };
}
