import { NextRequest, NextResponse } from 'next/server';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import { canInstructorAssignStudents } from '@/app/lib/instructor-permissions';
import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  INSTRUCTOR_DISPLAY_NAME_MAX_LENGTH,
  MEETING_DURATION_MINUTES,
  validateAvailabilityWindows,
  type AvailabilityWindowInput,
} from '@/app/lib/calendar/constants';
import { isGoogleCalendarConfigured } from '@/app/lib/calendar/google-oauth';
import { getInstructorBusyIntervals } from '@/app/lib/calendar/busy';
import { nthWeekdayForLocalDate } from '@/app/lib/calendar/ics';
import { loadSchedulingRoster } from '@/app/lib/calendar/scheduling-instructor';
import {
  anchorLocalDateFromOccurrence,
  formatNextMeetingLabel,
} from '@/app/lib/calendar/next-occurrence';
import { findPendingSkip, nextAttendedOccurrence } from '@/app/lib/calendar/skips';
import { prisma } from '@/db';

function normalizeHhMm(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return value;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** Which instructor unassigned students currently book with, from this instructor's point of view. */
async function defaultSchedulerInfo(instructorId: string) {
  const roster = await loadSchedulingRoster();
  const current = roster.instructors.find((i) => i.id === roster.defaultInstructorId) ?? null;
  return {
    defaultInstructorLabel: current?.label ?? null,
    isDefaultInstructor: roster.defaultInstructorId === instructorId,
  };
}

export async function GET() {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile, connection, windows, meetings, defaultInfo] = await Promise.all([
      prisma.instructor.findUnique({
        where: { id: instructor.id },
        select: { displayName: true, isDefaultScheduler: true },
      }),
      prisma.instructorGoogleCalendar.findUnique({
        where: { instructorId: instructor.id },
        select: { googleEmail: true },
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
          user: { select: { name: true, email: true } },
          skips: {
            where: { occurrenceStart: { gt: new Date() } },
            select: { occurrenceStart: true, reason: true },
          },
        },
      }),
      defaultSchedulerInfo(instructor.id),
    ]);

    const busy = connection
      ? await getInstructorBusyIntervals(instructor.id, DEFAULT_AVAILABILITY_TIMEZONE)
      : ({ status: 'not_connected' } as const);

    const bookings = meetings.map((m) => {
      const anchorLocalDate = anchorLocalDateFromOccurrence(m.firstOccurrence, m.timezone);
      const next = nextAttendedOccurrence(m, m.skips);
      const skip = findPendingSkip(m.skips);
      return {
        id: m.id,
        studentName: m.user.name || m.user.email || 'Student',
        studentEmail: m.user.email,
        weeklyKey: m.weeklyKey,
        dayOfWeek: m.dayOfWeek,
        localTime: m.localTime,
        nthWeekday: nthWeekdayForLocalDate(anchorLocalDate),
        nextOccurrenceLabel: next ? formatNextMeetingLabel(next.startIso, m.timezone) : null,
        skippedOccurrence: skip
          ? {
              start: skip.occurrenceStart.toISOString(),
              label: formatNextMeetingLabel(skip.occurrenceStart.toISOString(), m.timezone),
              reason: skip.reason,
            }
          : null,
      };
    });

    return NextResponse.json({
      googleConfigured: isGoogleCalendarConfigured(),
      canManageDefault: canInstructorAssignStudents(instructor),
      displayName: profile?.displayName ?? '',
      isDefaultScheduler: profile?.isDefaultScheduler ?? false,
      ...defaultInfo,
      meetingDurationMinutes: MEETING_DURATION_MINUTES,
      defaultTimezone: DEFAULT_AVAILABILITY_TIMEZONE,
      google: connection
        ? { connected: true, email: connection.googleEmail }
        : { connected: false },
      windows,
      bookings,
      busy,
    });
  } catch (error) {
    console.error('Error fetching instructor calendar settings:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const data: { displayName?: string | null; isDefaultScheduler?: boolean } = {};

    if ('displayName' in body) {
      if (typeof body.displayName !== 'string') {
        return NextResponse.json({ error: 'displayName must be a string' }, { status: 400 });
      }
      const displayName = body.displayName.trim().replace(/\s+/g, ' ');
      if (displayName.length > INSTRUCTOR_DISPLAY_NAME_MAX_LENGTH) {
        return NextResponse.json(
          { error: `Display name must be ${INSTRUCTOR_DISPLAY_NAME_MAX_LENGTH} characters or fewer.` },
          { status: 400 }
        );
      }
      data.displayName = displayName || null;
    }

    if ('isDefaultScheduler' in body) {
      if (!canInstructorAssignStudents(instructor)) {
        return NextResponse.json(
          { error: 'Only admins can choose the default instructor' },
          { status: 403 }
        );
      }
      if (typeof body.isDefaultScheduler !== 'boolean') {
        return NextResponse.json({ error: 'isDefaultScheduler must be a boolean' }, { status: 400 });
      }
      data.isDefaultScheduler = body.isDefaultScheduler;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefaultScheduler) {
        await tx.instructor.updateMany({
          where: { isDefaultScheduler: true, NOT: { id: instructor.id } },
          data: { isDefaultScheduler: false },
        });
      }
      return tx.instructor.update({
        where: { id: instructor.id },
        data,
        select: { displayName: true, isDefaultScheduler: true },
      });
    });

    return NextResponse.json({
      displayName: updated.displayName ?? '',
      isDefaultScheduler: updated.isDefaultScheduler,
      ...(await defaultSchedulerInfo(instructor.id)),
    });
  } catch (error) {
    console.error('Error saving instructor profile:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
