import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  MEETING_DURATION_MINUTES,
} from '@/app/lib/calendar/constants';
import { generateAvailableSlots, uniqueWeeklyKeys } from '@/app/lib/calendar/slots';
import {
  getInstructorDisplayName,
  resolveSchedulingInstructor,
} from '@/app/lib/calendar/scheduling-instructor';
import { prisma } from '@/db';

export async function GET(request: NextRequest) {
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

    const instructor = await resolveSchedulingInstructor();
    if (!instructor) {
      return NextResponse.json({
        instructorName: getInstructorDisplayName(),
        timezone: DEFAULT_AVAILABILITY_TIMEZONE,
        durationMinutes: MEETING_DURATION_MINUTES,
        slots: [],
        uniqueWeekly: [],
        message: 'No instructor is available for scheduling yet.',
      });
    }

    if (instructor.availabilityWindows.length === 0) {
      return NextResponse.json({
        instructorName: getInstructorDisplayName(),
        instructorId: instructor.id,
        timezone: DEFAULT_AVAILABILITY_TIMEZONE,
        durationMinutes: MEETING_DURATION_MINUTES,
        slots: [],
        uniqueWeekly: [],
        message: 'The instructor has not set availability windows yet.',
      });
    }

    const daysParam = Number(request.nextUrl.searchParams.get('days') || '42');
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 7), 90) : 42;
    const mode = request.nextUrl.searchParams.get('mode') || 'unique';

    const meetings = await prisma.studentMonthlyMeeting.findMany({
      where: { instructorId: instructor.id },
      select: { weeklyKey: true, userId: true },
    });

    const occupied = meetings
      .filter((m) => m.userId !== user.id)
      .map((m) => ({ weeklyKey: m.weeklyKey }));

    const timezone =
      instructor.availabilityWindows[0]?.timezone || DEFAULT_AVAILABILITY_TIMEZONE;

    const slots = generateAvailableSlots({
      windows: instructor.availabilityWindows,
      days,
      timezone,
      durationMinutes: MEETING_DURATION_MINUTES,
      occupied,
    });

    const unique = uniqueWeeklyKeys(slots);

    return NextResponse.json({
      instructorName: getInstructorDisplayName(),
      instructorId: instructor.id,
      timezone,
      durationMinutes: MEETING_DURATION_MINUTES,
      days,
      slots: mode === 'all' ? slots : unique,
      uniqueWeekly: unique,
    });
  } catch (error) {
    console.error('Error listing student calendar slots:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
