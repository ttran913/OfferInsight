import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { MEETING_DURATION_MINUTES } from '@/app/lib/calendar/constants';
import { getInstructorDisplayName } from '@/app/lib/calendar/scheduling-instructor';
import { loadBookableDaysForUser } from '@/app/lib/calendar/student-booking';
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

    const { instructor, timezone, days } = await loadBookableDaysForUser(user.id);

    return NextResponse.json({
      instructorName: getInstructorDisplayName(instructor),
      timezone,
      durationMinutes: MEETING_DURATION_MINUTES,
      days: days.map((d) => ({
        localDate: d.localDate,
        dayOfWeek: d.dayOfWeek,
        nthWeekday: d.nthWeekday,
        times: d.slots.map((s) => s.localTime),
      })),
      message: !instructor
        ? 'No instructor is available for scheduling yet.'
        : instructor.availabilityWindows.length === 0
          ? 'The instructor has not set availability windows yet.'
          : null,
    });
  } catch (error) {
    console.error('Error listing student calendar slots:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
