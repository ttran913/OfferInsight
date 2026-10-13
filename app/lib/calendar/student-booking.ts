import { prisma } from '@/db';
import { DEFAULT_AVAILABILITY_TIMEZONE, MEETING_DURATION_MINUTES } from './constants';
import { bookingWindowSlots, findBookableDays, type BookableDay } from './bookable-days';
import { getBusyIntervalsForBooking } from './busy';
import type { BusyInterval } from './conflicts';
import { nthWeekdayForLocalDate } from './ics';
import {
  findOneTimeSlots,
  meetingStartsBetween,
  oneTimeMoveTarget,
  type MoveFields,
  type OneTimeDay,
} from './moves';
import { anchorLocalDateFromOccurrence } from './next-occurrence';
import { resolveSchedulingInstructorForUser } from './scheduling-instructor';

/** The student's instructor and the dates/times they can start a monthly series on. */
export async function loadBookableDaysForUser(userId: string) {
  const instructor = await resolveSchedulingInstructorForUser(userId);
  const timezone = instructor?.availabilityWindows[0]?.timezone || DEFAULT_AVAILABILITY_TIMEZONE;
  if (!instructor || instructor.availabilityWindows.length === 0) {
    return { instructor, timezone, days: [] as BookableDay[] };
  }

  const now = new Date();
  const [others, busy] = await Promise.all([
    prisma.studentMonthlyMeeting.findMany({
      where: { instructorId: instructor.id, userId: { not: userId } },
      select: {
        weeklyKey: true,
        firstOccurrence: true,
        timezone: true,
        moves: { where: { newStart: { gt: now } }, select: { newStart: true } },
      },
    }),
    getBusyIntervalsForBooking(instructor.id, timezone),
  ]);

  const durationMs = MEETING_DURATION_MINUTES * 60 * 1000;
  // A new series must not land on a time another student moved into for one date.
  const movedInto: BusyInterval[] = others.flatMap((m) =>
    m.moves.map((mv) => ({
      start: mv.newStart.toISOString(),
      end: new Date(mv.newStart.getTime() + durationMs).toISOString(),
      title: "Another student's 1:1",
    }))
  );

  const days = findBookableDays({
    slots: bookingWindowSlots({ windows: instructor.availabilityWindows, timezone }),
    busy: [...busy, ...movedInto],
    booked: others.map((m) => ({
      weeklyKey: m.weeklyKey,
      nthWeekday: nthWeekdayForLocalDate(anchorLocalDateFromOccurrence(m.firstOccurrence, m.timezone)),
    })),
    durationMinutes: MEETING_DURATION_MINUTES,
  });
  return { instructor, timezone, days };
}

/** What a student can move their next meeting to, one time, with their current instructor. */
export async function loadOneTimeOptions(
  meeting: {
    id: string;
    instructorId: string;
    dayOfWeek: number;
    localTime: string;
    timezone: string;
    firstOccurrence: Date;
    moves: MoveFields[];
  },
  now = new Date()
) {
  const target = oneTimeMoveTarget(meeting, meeting.moves, now);
  if (!target) return { target: null, days: [] as OneTimeDay[] };

  const [windows, others, busy] = await Promise.all([
    prisma.instructorAvailabilityWindow.findMany({
      where: { instructorId: meeting.instructorId },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.studentMonthlyMeeting.findMany({
      where: { instructorId: meeting.instructorId, id: { not: meeting.id } },
      select: {
        dayOfWeek: true,
        localTime: true,
        timezone: true,
        firstOccurrence: true,
        moves: { select: { originalStart: true, newStart: true } },
      },
    }),
    getBusyIntervalsForBooking(meeting.instructorId, meeting.timezone),
  ]);

  const days = findOneTimeSlots({
    windows,
    timezone: meeting.timezone,
    now,
    windowEnd: target.windowEnd,
    busy,
    taken: others.flatMap((o) => [
      ...meetingStartsBetween(o, o.moves, now, target.windowEnd),
      // A vacated regular time stays reserved so its student can undo their move.
      ...o.moves.map((m) => m.originalStart.getTime()),
    ]),
    excludeStarts: [target.originalStart, ...(target.move ? [target.move.newStart] : [])],
  });
  return { target, days };
}
