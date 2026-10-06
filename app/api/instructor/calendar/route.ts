import { NextRequest, NextResponse } from 'next/server';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import { canInstructorMutateUserData } from '@/app/lib/instructor-permissions';
import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  MEETING_DURATION_MINUTES,
  MEETING_MAX_HEADCOUNT,
  validateAvailabilityWindows,
  type AvailabilityWindowInput,
} from '@/app/lib/calendar/constants';
import { isGoogleCalendarConfigured } from '@/app/lib/calendar/google-oauth';
import { nthWeekdayForLocalDate } from '@/app/lib/calendar/ics';
import {
  anchorLocalDateFromOccurrence,
  formatNextMeetingLabel,
  getNextMonthlyOccurrence,
} from '@/app/lib/calendar/next-occurrence';
import { prisma } from '@/db';

function normalizeHhMm(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return value;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export async function GET() {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [connection, windows, meetings] = await Promise.all([
      prisma.instructorGoogleCalendar.findUnique({
        where: { instructorId: instructor.id },
        select: {
          googleEmail: true,
          connectedAt: true,
          updatedAt: true,
          scope: true,
        },
      }),
      prisma.instructorAvailabilityWindow.findMany({
        where: { instructorId: instructor.id },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          timezone: true,
        },
      }),
      prisma.studentMonthlyMeeting.findMany({
        where: { instructorId: instructor.id },
        orderBy: [{ dayOfWeek: 'asc' }, { localTime: 'asc' }],
        select: {
          id: true,
          weeklyKey: true,
          dayOfWeek: true,
          localTime: true,
          timezone: true,
          firstOccurrence: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const bookings = meetings.map((m) => {
      const anchorLocalDate = anchorLocalDateFromOccurrence(m.firstOccurrence, m.timezone);
      const next = getNextMonthlyOccurrence({
        dayOfWeek: m.dayOfWeek,
        localTime: m.localTime,
        timezone: m.timezone,
        anchorLocalDate,
      });
      return {
        id: m.id,
        userId: m.user.id,
        studentName: m.user.name || m.user.email || 'Student',
        studentEmail: m.user.email,
        weeklyKey: m.weeklyKey,
        dayOfWeek: m.dayOfWeek,
        localTime: m.localTime,
        nthWeekday: nthWeekdayForLocalDate(anchorLocalDate),
        nextOccurrence: next?.startIso ?? null,
        nextOccurrenceLabel: next ? formatNextMeetingLabel(next.startIso, m.timezone) : null,
      };
    });

    return NextResponse.json({
      googleConfigured: isGoogleCalendarConfigured(),
      canEdit: canInstructorMutateUserData(instructor),
      meetingDurationMinutes: MEETING_DURATION_MINUTES,
      meetingMaxHeadcount: MEETING_MAX_HEADCOUNT,
      defaultTimezone: DEFAULT_AVAILABILITY_TIMEZONE,
      google: connection
        ? {
            connected: true,
            email: connection.googleEmail,
            connectedAt: connection.connectedAt,
            updatedAt: connection.updatedAt,
          }
        : { connected: false },
      windows,
      bookings,
    });
  } catch (error) {
    console.error('Error fetching instructor calendar settings:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!canInstructorMutateUserData(instructor)) {
      return NextResponse.json(
        { error: 'Read-only instructors cannot edit calendar settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const windows = (body.windows ?? []) as AvailabilityWindowInput[];
    if (!Array.isArray(windows)) {
      return NextResponse.json({ error: 'windows must be an array' }, { status: 400 });
    }

    const normalized = windows.map((w) => ({
      ...w,
      startTime: normalizeHhMm(w.startTime),
      endTime: normalizeHhMm(w.endTime),
    }));

    const validationError = validateAvailabilityWindows(normalized);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const timezone =
      typeof body.timezone === 'string' && body.timezone.trim()
        ? body.timezone.trim()
        : DEFAULT_AVAILABILITY_TIMEZONE;

    await prisma.$transaction(async (tx) => {
      await tx.instructorAvailabilityWindow.deleteMany({
        where: { instructorId: instructor.id },
      });
      if (normalized.length > 0) {
        await tx.instructorAvailabilityWindow.createMany({
          data: normalized.map((w) => ({
            instructorId: instructor.id,
            dayOfWeek: w.dayOfWeek,
            startTime: w.startTime,
            endTime: w.endTime,
            timezone,
          })),
        });
      }
    });

    const saved = await prisma.instructorAvailabilityWindow.findMany({
      where: { instructorId: instructor.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return NextResponse.json({ windows: saved });
  } catch (error) {
    console.error('Error saving instructor availability:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
