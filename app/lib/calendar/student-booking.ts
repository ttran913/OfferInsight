import { prisma } from '@/db';
import { DEFAULT_AVAILABILITY_TIMEZONE, MEETING_DURATION_MINUTES } from './constants';
import { bookingWindowSlots, findBookableDays, type BookableDay } from './bookable-days';
import { getBusyIntervalsForBooking } from './busy';
import { nthWeekdayForLocalDate } from './ics';
import { anchorLocalDateFromOccurrence } from './next-occurrence';
import { resolveSchedulingInstructorForUser } from './scheduling-instructor';

/** The student's instructor and the dates/times they can start a monthly series on. */
export async function loadBookableDaysForUser(userId: string) {
  const instructor = await resolveSchedulingInstructorForUser(userId);
  const timezone = instructor?.availabilityWindows[0]?.timezone || DEFAULT_AVAILABILITY_TIMEZONE;
  if (!instructor || instructor.availabilityWindows.length === 0) {
    return { instructor, timezone, days: [] as BookableDay[] };
  }

  const [others, busy] = await Promise.all([
    prisma.studentMonthlyMeeting.findMany({
      where: { instructorId: instructor.id, userId: { not: userId } },
      select: { weeklyKey: true, firstOccurrence: true, timezone: true },
    }),
    getBusyIntervalsForBooking(instructor.id, timezone),
  ]);

  const days = findBookableDays({
    slots: bookingWindowSlots({ windows: instructor.availabilityWindows, timezone }),
    busy,
    booked: others.map((m) => ({
      weeklyKey: m.weeklyKey,
      nthWeekday: nthWeekdayForLocalDate(anchorLocalDateFromOccurrence(m.firstOccurrence, m.timezone)),
    })),
    durationMinutes: MEETING_DURATION_MINUTES,
  });
  return { instructor, timezone, days };
}
