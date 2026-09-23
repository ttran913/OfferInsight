import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  DEFAULT_AVAILABILITY_TIMEZONE,
  DAY_LABELS,
  MEETING_DURATION_MINUTES,
} from '@/app/lib/calendar/constants';
import { generateAvailableSlots, uniqueWeeklyKeys } from '@/app/lib/calendar/slots';
import {
  buildMonthlyMeetingEmail,
  buildMonthlyMeetingIcs,
} from '@/app/lib/calendar/ics';
import {
  getInstructorDisplayName,
  resolveSchedulingInstructor,
} from '@/app/lib/calendar/scheduling-instructor';
import {
  anchorLocalDateFromOccurrence,
  formatNextMeetingLabel,
  getNextMonthlyOccurrence,
} from '@/app/lib/calendar/next-occurrence';
import { sendEmail } from '@/app/lib/email';
import { syncMonthlyMeetingOnInstructorCalendar } from '@/app/lib/calendar/google-calendar';
import { prisma } from '@/db';

function meetingPayload(m: {
  id: string;
  weeklyKey: string;
  dayOfWeek: number;
  localTime: string;
  timezone: string;
  firstOccurrence: Date;
}) {
  const anchorLocalDate = anchorLocalDateFromOccurrence(
    m.firstOccurrence,
    m.timezone
  );
  const next = getNextMonthlyOccurrence({
    dayOfWeek: m.dayOfWeek,
    localTime: m.localTime,
    timezone: m.timezone,
    anchorLocalDate,
  });

  return {
    id: m.id,
    weeklyKey: m.weeklyKey,
    dayOfWeek: m.dayOfWeek,
    dayLabel: DAY_LABELS[m.dayOfWeek],
    localTime: m.localTime,
    timezone: m.timezone,
    firstOccurrence: m.firstOccurrence.toISOString(),
    nextOccurrence: next?.startIso ?? null,
    nextOccurrenceLabel: next
      ? formatNextMeetingLabel(next.startIso, m.timezone)
      : null,
  };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        onboardingProgress: true,
        monthlyMeeting: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const instructorName = getInstructorDisplayName();

    if (!user.monthlyMeeting) {
      return NextResponse.json({
        meeting: null,
        instructorName,
        onboardingProgress: user.onboardingProgress,
      });
    }

    const m = user.monthlyMeeting;
    return NextResponse.json({
      meeting: meetingPayload(m),
      instructorName,
      onboardingProgress: user.onboardingProgress,
    });
  } catch (error) {
    console.error('Error fetching monthly meeting:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        monthlyMeeting: true,
      },
    });
    if (!user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const weeklyKey = typeof body.weeklyKey === 'string' ? body.weeklyKey.trim() : '';
    if (!weeklyKey || !/^[0-6]\|\d{2}:\d{2}$/.test(weeklyKey)) {
      return NextResponse.json(
        { error: 'weeklyKey is required (e.g. "3|10:00")' },
        { status: 400 }
      );
    }

    const instructor = await resolveSchedulingInstructor();
    if (!instructor || instructor.availabilityWindows.length === 0) {
      return NextResponse.json(
        { error: 'Instructor availability is not configured yet.' },
        { status: 503 }
      );
    }

    const others = await prisma.studentMonthlyMeeting.findMany({
      where: {
        instructorId: instructor.id,
        userId: { not: user.id },
      },
      select: { weeklyKey: true },
    });

    const timezone =
      instructor.availabilityWindows[0]?.timezone || DEFAULT_AVAILABILITY_TIMEZONE;

    const slots = generateAvailableSlots({
      windows: instructor.availabilityWindows,
      days: 62,
      timezone,
      durationMinutes: MEETING_DURATION_MINUTES,
      occupied: others.map((o) => ({ weeklyKey: o.weeklyKey })),
    });

    const match =
      uniqueWeeklyKeys(slots).find((s) => s.weeklyKey === weeklyKey) ||
      slots.find((s) => s.weeklyKey === weeklyKey);

    if (!match) {
      return NextResponse.json(
        { error: 'That time slot is no longer available. Pick another.' },
        { status: 409 }
      );
    }

    const isReschedule = Boolean(user.monthlyMeeting);
    const previousGoogleEventId = user.monthlyMeeting?.googleEventId ?? null;
    const instructorName = getInstructorDisplayName();

    const meeting = await prisma.$transaction(async (tx) => {
      const saved = await tx.studentMonthlyMeeting.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          instructorId: instructor.id,
          weeklyKey: match.weeklyKey,
          dayOfWeek: match.dayOfWeek,
          localTime: match.localTime,
          timezone: match.timezone,
          firstOccurrence: new Date(match.start),
        },
        update: {
          instructorId: instructor.id,
          weeklyKey: match.weeklyKey,
          dayOfWeek: match.dayOfWeek,
          localTime: match.localTime,
          timezone: match.timezone,
          firstOccurrence: new Date(match.start),
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { onboardingProgress: 4 },
      });

      return saved;
    });

    let googleSynced = false;
    let googleError: string | null = null;
    try {
      const eventId = await syncMonthlyMeetingOnInstructorCalendar({
        instructorId: instructor.id,
        previousEventId: previousGoogleEventId,
        slot: match,
        studentName: user.name,
        studentEmail: user.email,
      });
      if (eventId) {
        await prisma.studentMonthlyMeeting.update({
          where: { id: meeting.id },
          data: { googleEventId: eventId },
        });
        googleSynced = true;
      } else {
        googleError = 'Instructor Google Calendar is not connected.';
      }
    } catch (err) {
      console.error('Failed to sync meeting to Google Calendar:', err);
      googleError =
        err instanceof Error ? err.message : 'Failed to sync Google Calendar';
    }

    let emailSent = false;
    let emailError: string | null = null;
    try {
      const ics = buildMonthlyMeetingIcs({
        slot: match,
        studentName: user.name,
        studentEmail: user.email,
        instructorName,
      });
      const mail = buildMonthlyMeetingEmail({
        studentName: user.name,
        instructorName,
        slot: match,
        isReschedule,
      });
      await sendEmail({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: [
          {
            filename: ics.filename,
            content: ics.content,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ],
      });
      emailSent = true;
    } catch (err) {
      console.error('Failed to send monthly meeting .ics email:', err);
      emailError =
        err instanceof Error ? err.message : 'Failed to send calendar invite email';
    }

    return NextResponse.json({
      meeting: meetingPayload({
        ...meeting,
        firstOccurrence: meeting.firstOccurrence,
      }),
      instructorName,
      onboardingProgress: 4,
      emailSent,
      emailError,
      googleSynced,
      googleError,
    });
  } catch (error) {
    console.error('Error saving monthly meeting:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
