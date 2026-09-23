import { NextRequest, NextResponse } from 'next/server';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  MEETING_DURATION_MINUTES,
} from '@/app/lib/calendar/constants';
import { generateAvailableSlots, uniqueWeeklyKeys } from '@/app/lib/calendar/slots';
import { prisma } from '@/db';

export async function GET(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const daysParam = Number(request.nextUrl.searchParams.get('days') || '14');
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 60) : 14;
    const uniqueOnly = request.nextUrl.searchParams.get('unique') === '1';

    const windows = await prisma.instructorAvailabilityWindow.findMany({
      where: { instructorId: instructor.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    if (windows.length === 0) {
      return NextResponse.json({
        timezone: DEFAULT_AVAILABILITY_TIMEZONE,
        durationMinutes: MEETING_DURATION_MINUTES,
        days,
        slots: [],
        uniqueWeekly: [],
        message: 'No availability windows configured.',
      });
    }

    const meetings = await prisma.studentMonthlyMeeting.findMany({
      where: { instructorId: instructor.id },
      select: { weeklyKey: true },
    });

    const timezone = windows[0]?.timezone || DEFAULT_AVAILABILITY_TIMEZONE;
    const slots = generateAvailableSlots({
      windows,
      days,
      timezone,
      durationMinutes: MEETING_DURATION_MINUTES,
      occupied: meetings.map((m) => ({ weeklyKey: m.weeklyKey })),
    });

    return NextResponse.json({
      timezone,
      durationMinutes: MEETING_DURATION_MINUTES,
      days,
      slotCount: slots.length,
      slots: uniqueOnly ? uniqueWeeklyKeys(slots) : slots,
      uniqueWeekly: uniqueWeeklyKeys(slots),
    });
  } catch (error) {
    console.error('Error generating calendar slots:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
