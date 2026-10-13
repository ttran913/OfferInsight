import { nthWeekdayForLocalDate } from './ics';
import { nextMeeting, type MoveFields } from './moves';
import {
  anchorLocalDateFromOccurrence,
  formatMonthlyScheduleLabel,
  formatNextMeetingLabel,
} from './next-occurrence';

/** A student's monthly meeting as returned to the student UI. */
export function meetingPayload(
  m: {
    dayOfWeek: number;
    localTime: string;
    timezone: string;
    firstOccurrence: Date;
  },
  moves: MoveFields[] = []
) {
  const anchorLocalDate = anchorLocalDateFromOccurrence(m.firstOccurrence, m.timezone);
  const next = nextMeeting(m, moves);
  const nthWeekday = nthWeekdayForLocalDate(anchorLocalDate);

  return {
    dayOfWeek: m.dayOfWeek,
    nthWeekday,
    scheduleLabel: formatMonthlyScheduleLabel(nthWeekday, m.dayOfWeek, m.localTime),
    localTime: m.localTime,
    timezone: m.timezone,
    nextOccurrenceDate: next?.localDate ?? null,
    nextOccurrenceLabel: next ? formatNextMeetingLabel(next.startIso, m.timezone) : null,
    /** Set when the next meeting was moved one time; the regular date it replaces. */
    movedFrom: next?.movedFrom
      ? { start: next.movedFrom, label: formatNextMeetingLabel(next.movedFrom, m.timezone) }
      : null,
  };
}
