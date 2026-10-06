import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  BOOKING_CANDIDATE_DAYS,
  DEFAULT_AVAILABILITY_TIMEZONE,
  MEETING_DURATION_MINUTES,
} from '@/app/lib/calendar/constants';
import { generateAvailableSlots } from '@/app/lib/calendar/slots';
import { getBusyIntervalsForBooking } from '@/app/lib/calendar/busy';
import { resolveStandingTimes } from '@/app/lib/calendar/conflicts';
import {
  getInstructorDisplayName,
  resolveSchedulingInstructorForUser,
} from '@/app/lib/calendar/scheduling-instructor';
import { prisma } from '@/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const instructor = await resolveSchedulingInstructorForUser(user.id);
    if (!instructor) {
      return NextResponse.json({
        instructorName: getInstructorDisplayName(null),
        timezone: DEFAULT_AVAILABILITY_TIMEZONE,
        durationMinutes: MEETING_DURATION_MINUTES,
        slots: [],
        message: 'No instructor is available for scheduling yet.',
      });
    }

    if (instructor.availabilityWindows.length === 0) {
      return NextResponse.json({
        instructorName: getInstructorDisplayName(instructor),
        timezone: DEFAULT_AVAILABILITY_TIMEZONE,
        durationMinutes: MEETING_DURATION_MINUTES,
        slots: [],
        message: 'The instructor has not set availability windows yet.',
      });
    }

    const meetings = await prisma.studentMonthlyMeeting.findMany({
      where: { instructorId: instructor.id },
      select: { weeklyKey: true, userId: true },
    });

    const timezone =
      instructor.availabilityWindows[0]?.timezone || DEFAULT_AVAILABILITY_TIMEZONE;

    const candidates = generateAvailableSlots({
      windows: instructor.availabilityWindows,
      days: BOOKING_CANDIDATE_DAYS,
      timezone,
      durationMinutes: MEETING_DURATION_MINUTES,
      occupied: meetings
        .filter((m) => m.userId !== user.id)
        .map((m) => ({ weeklyKey: m.weeklyKey })),
    });
    const busy = await getBusyIntervalsForBooking(instructor.id, timezone);

    const { anchors } = resolveStandingTimes({
      slots: candidates,
      busy,
      durationMinutes: MEETING_DURATION_MINUTES,
    });
    return NextResponse.json({
      instructorName: getInstructorDisplayName(instructor),
      timezone,
      durationMinutes: MEETING_DURATION_MINUTES,
      slots: [...anchors.values()].sort((a, b) => a.start.localeCompare(b.start)),
    });
  } catch (error) {
    console.error('Error listing student calendar slots:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
