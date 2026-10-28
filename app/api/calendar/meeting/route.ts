import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserIdForRequest } from '@/app/lib/api-user-helper';
import {
  buildMeetingBookedInstructorEmail,
  buildMonthlyMeetingEmail,
  buildMonthlyMeetingIcs,
} from '@/app/lib/calendar/ics';
import { emailInstructor } from '@/app/lib/calendar/instructor-email';
import { meetingDetailsPayload } from '@/app/lib/calendar/meeting-details';
import { meetingPayload } from '@/app/lib/calendar/meeting-payload';
import {
  getInstructorDisplayName,
  resolveSchedulingInstructorForUser,
} from '@/app/lib/calendar/scheduling-instructor';
import { sendEmail } from '@/app/lib/email';
import { syncMonthlyMeetingOnInstructorCalendar } from '@/app/lib/calendar/google-calendar';
import { loadBookableDaysForUser } from '@/app/lib/calendar/student-booking';
import {
  CLEARED_BOOKING_CLOCK,
  currentDeadline,
  deadlineLabel,
  isMustBookReason,
} from '@/app/lib/must-book';
import { prisma } from '@/db';

export async function GET(request: NextRequest) {
  try {
    const { userId, error } = await getUserIdForRequest(request);
    if (!userId) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        mustBookSince: true,
        mustBookReason: true,
        bookFinalWarningSentAt: true,
        missedMeetings: {
          orderBy: { occurrenceStart: 'desc' },
          take: 1,
          select: { occurrenceStart: true },
        },
        monthlyMeeting: {
          include: {
            instructor: {
              select: {
                displayName: true,
                meetingLocationType: true,
                meetingLocation: true,
                contactEmail: true,
              },
            },
            moves: { select: { originalStart: true, newStart: true } },
          },
        },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const instructor =
      user.monthlyMeeting?.instructor ?? (await resolveSchedulingInstructorForUser(user.id));
    const instructorName = getInstructorDisplayName(instructor);
    const details = meetingDetailsPayload(instructor);

    const missed = user.missedMeetings[0]?.occurrenceStart;
    return NextResponse.json({
      meeting: user.monthlyMeeting
        ? meetingPayload(user.monthlyMeeting, user.monthlyMeeting.moves)
        : null,
      instructorName,
      meetingLocation: details.location,
      contactEmail: details.contactEmail,
      mustBook:
        user.mustBookSince && isMustBookReason(user.mustBookReason) && !user.monthlyMeeting
          ? {
              reason: user.mustBookReason,
              missedLabel:
                user.mustBookReason === 'missedMeeting' && missed
                  ? deadlineLabel(missed)
                  : null,
              deadlineLabel: deadlineLabel(
                currentDeadline({
                  mustBookSince: user.mustBookSince,
                  bookFinalWarningSentAt: user.bookFinalWarningSentAt,
                })
              ),
              finalWarningSent: Boolean(user.bookFinalWarningSentAt),
            }
          : null,
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
    const localDate = typeof body.localDate === 'string' ? body.localDate.trim() : '';
    const localTime = typeof body.localTime === 'string' ? body.localTime.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}$/.test(localTime)) {
      return NextResponse.json(
        { error: 'localDate (YYYY-MM-DD) and localTime (HH:mm) are required' },
        { status: 400 }
      );
    }

    const { instructor, days } = await loadBookableDaysForUser(user.id);
    if (!instructor || instructor.availabilityWindows.length === 0) {
      return NextResponse.json(
        { error: 'Instructor availability is not configured yet.' },
        { status: 503 }
      );
    }

    const match = days
      .find((d) => d.localDate === localDate)
      ?.slots.find((s) => s.localTime === localTime);

    if (!match) {
      return NextResponse.json(
        { error: 'That time slot is no longer available. Pick another.' },
        { status: 409 }
      );
    }

    const isReschedule = Boolean(user.monthlyMeeting);
    const previousGoogleEventId = user.monthlyMeeting?.googleEventId ?? null;
    const instructorName = getInstructorDisplayName(instructor);
    const details = meetingDetailsPayload(instructor);

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
          googleEventId: null,
        },
      });

      // A new regular schedule replaces the old series, along with any one-time moves of it.
      await tx.movedMeeting.deleteMany({ where: { meetingId: saved.id } });

      await tx.user.update({
        where: { id: user.id },
        data: { onboardingProgress: 4, ...CLEARED_BOOKING_CLOCK },
      });

      return saved;
    });

    let googleSynced = false;
    let googleError: string | null = null;
    try {
      const eventId = await syncMonthlyMeetingOnInstructorCalendar({
        instructorId: instructor.id,
        previousInstructorId: user.monthlyMeeting?.instructorId ?? null,
        previousEventId: previousGoogleEventId,
        slot: match,
        studentName: user.name,
        studentEmail: user.email,
        meetingLocation: details.location,
        contactEmail: details.contactEmail,
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
        meetingLocation: details.location,
        contactEmail: details.contactEmail,
      });
      const mail = buildMonthlyMeetingEmail({
        studentName: user.name,
        instructorName,
        slot: match,
        isReschedule,
        meetingLocation: details.location,
        contactEmail: details.contactEmail,
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

    await emailInstructor(
      instructor.id,
      buildMeetingBookedInstructorEmail({
        studentName: user.name || user.email,
        slot: match,
        isReschedule,
        calendarSynced: googleSynced,
      })
    );

    return NextResponse.json({
      meeting: meetingPayload(meeting),
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
