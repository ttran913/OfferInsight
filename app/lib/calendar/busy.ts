import { prisma } from '@/db';
import { BUSY_LOOKAHEAD_DAYS } from './constants';
import type { BusyInterval } from './conflicts';
import { listPrimaryCalendarEvents } from './google-calendar';
import { zonedWallTimeToUtc } from './slots';

export type BusyCheck =
  | { status: 'ok'; intervals: BusyInterval[] }
  | { status: 'not_connected' }
  | { status: 'error' };

function allDayToUtc(date: string, timezone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return zonedWallTimeToUtc(y, m, d, 0, 0, timezone);
}

/**
 * Busy time on the instructor's primary Google Calendar for the conflict lookahead window.
 * Ignores OpenSourceResume 1:1s (handled by booking occupancy), events marked "Free",
 * events the instructor declined, and working-location markers.
 */
export async function getInstructorBusyIntervals(
  instructorId: string,
  timezone: string,
  now: Date = new Date()
): Promise<BusyCheck> {
  const rangeEnd = new Date(now.getTime() + BUSY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  let events;
  try {
    events = await listPrimaryCalendarEvents(instructorId, now, rangeEnd);
  } catch (err) {
    console.warn('Could not read Google Calendar for conflict checks:', err);
    return { status: 'error' };
  }
  if (!events) return { status: 'not_connected' };

  const meetings = await prisma.studentMonthlyMeeting.findMany({
    where: { instructorId, googleEventId: { not: null } },
    select: { googleEventId: true },
  });
  const openSourceResumeIds = new Set(meetings.map((m) => m.googleEventId as string));

  const intervals: BusyInterval[] = [];
  for (const e of events) {
    if (e.transparency === 'transparent') continue;
    if (e.eventType === 'workingLocation') continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) continue;
    if ((e.id && openSourceResumeIds.has(e.id)) || (e.recurringEventId && openSourceResumeIds.has(e.recurringEventId))) {
      continue;
    }

    const title = e.summary || 'Busy';
    if (e.start?.dateTime && e.end?.dateTime) {
      intervals.push({ start: e.start.dateTime, end: e.end.dateTime, title });
    } else if (e.start?.date) {
      const endDate = e.end?.date ?? e.start.date;
      intervals.push({
        start: allDayToUtc(e.start.date, timezone).toISOString(),
        end: allDayToUtc(endDate, timezone).toISOString(),
        title,
      });
    }
  }
  return { status: 'ok', intervals };
}

/**
 * Busy intervals for student booking. Empty when Google is not connected or
 * unreachable, so booking stays open (the instructor sees a warning instead).
 */
export async function getBusyIntervalsForBooking(
  instructorId: string,
  timezone: string
): Promise<BusyInterval[]> {
  const busy = await getInstructorBusyIntervals(instructorId, timezone);
  return busy.status === 'ok' ? busy.intervals : [];
}
