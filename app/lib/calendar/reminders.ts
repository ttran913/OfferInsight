import { addDaysToDateKey, localDateKey } from './month-grid';
import { nextMeeting, type MoveFields } from './moves';

type ReminderMeeting = {
  dayOfWeek: number;
  localTime: string;
  timezone: string;
  firstOccurrence: Date;
  lastReminderFor: Date | null;
};

/**
 * The meeting to send a day-before reminder for: the student's next actual meeting
 * (a one-time move counts at its new time) when it falls on tomorrow (meeting
 * timezone) and hasn't been reminded yet.
 */
export function occurrenceNeedingReminder(
  meeting: ReminderMeeting,
  moves: MoveFields[],
  now = new Date()
) {
  const next = nextMeeting(meeting, moves, now);
  if (!next) return null;
  const tomorrow = addDaysToDateKey(localDateKey(now, meeting.timezone), 1);
  if (next.localDate !== tomorrow) return null;
  if (meeting.lastReminderFor?.getTime() === Date.parse(next.startIso)) return null;
  return next;
}
