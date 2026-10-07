import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { setMonthlyMeetingOccurrenceCancelled } from '@/app/lib/calendar/google-calendar';
import {
  buildMeetingSkipInstructorEmail,
  buildMeetingSkipStudentEmail,
  buildMonthlyOccurrenceIcs,
} from '@/app/lib/calendar/ics';
import { meetingPayload } from '@/app/lib/calendar/meeting-payload';
import { formatNextMeetingLabel, seriesAnchorSlot } from '@/app/lib/calendar/next-occurrence';
import { getInstructorDisplayName } from '@/app/lib/calendar/scheduling-instructor';
import { findPendingSkip, normalizeSkipReason, planSkip } from '@/app/lib/calendar/skips';
import { sendEmail } from '@/app/lib/email';
import { prisma } from '@/db';

async function loadStudentMeeting() {
  const session = await auth();
  if (!session?.user?.email) return { error: 'Unauthorized', status: 401 } as const;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      name: true,
      email: true,
      monthlyMeeting: {
        include: {
          skips: { orderBy: { occurrenceStart: 'asc' } },
          instructor: {
            select: { displayName: true, googleCalendar: { select: { googleEmail: true } } },
          },
        },
      },
    },
  });
  if (!user?.email) return { error: 'User not found', status: 404 } as const;
  if (!user.monthlyMeeting) {
    return { error: 'You do not have a monthly meeting scheduled.', status: 404 } as const;
  }
  return { user: { ...user, email: user.email }, meeting: user.monthlyMeeting } as const;
}

type Loaded = Exclude<Awaited<ReturnType<typeof loadStudentMeeting>>, { error: string }>;

/** Google Calendar + student/instructor emails for a skip (cancelled) or an undo. */
async function notifySkipChange(
  { user, meeting }: Loaded,
  occurrenceStart: Date,
  cancelled: boolean,
  reason: string | null,
  nextLabel: string | null
) {
  const instructorName = getInstructorDisplayName(meeting.instructor);
  const occurrenceLabel = formatNextMeetingLabel(occurrenceStart.toISOString(), meeting.timezone);

  if (meeting.googleEventId) {
    try {
      await setMonthlyMeetingOccurrenceCancelled(
        meeting.instructorId,
        meeting.googleEventId,
        occurrenceStart,
        cancelled
      );
    } catch (err) {
      console.error('Failed to update skipped occurrence on Google Calendar:', err);
    }
  }

  try {
    const ics = buildMonthlyOccurrenceIcs({
      slot: seriesAnchorSlot(meeting),
      studentName: user.name,
      studentEmail: user.email,
      instructorName,
      occurrenceStart: occurrenceStart.toISOString(),
      cancelled,
    });
    const mail = buildMeetingSkipStudentEmail({
      studentName: user.name,
      instructorName,
      occurrenceLabel,
      nextLabel,
      undone: !cancelled,
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
          contentType: `text/calendar; charset=utf-8; method=${cancelled ? 'CANCEL' : 'REQUEST'}`,
        },
      ],
    });
  } catch (err) {
    console.error('Failed to send skip email to student:', err);
  }

  const instructorEmail = meeting.instructor.googleCalendar?.googleEmail;
  if (instructorEmail) {
    try {
      const mail = buildMeetingSkipInstructorEmail({
        studentName: user.name || user.email,
        occurrenceLabel,
        reason,
        undone: !cancelled,
      });
      await sendEmail({ to: instructorEmail, ...mail });
    } catch (err) {
      console.error('Failed to send skip email to instructor:', err);
    }
  }
}

/** Skip the next upcoming meeting once; the monthly series is unchanged. */
export async function POST(request: NextRequest) {
  try {
    const loaded = await loadStudentMeeting();
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }
    const { meeting } = loaded;

    const body = await request.json().catch(() => ({}));
    const reason = normalizeSkipReason(body?.reason);

    const plan = planSkip(meeting, meeting.skips);
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: 409 });
    }

    const created = await prisma.skippedMeeting.create({
      data: { meetingId: meeting.id, occurrenceStart: plan.occurrenceStart, reason },
    });
    const payload = meetingPayload(meeting, [...meeting.skips, created]);
    await notifySkipChange(
      loaded,
      plan.occurrenceStart,
      true,
      reason,
      payload.nextOccurrenceLabel
    );

    return NextResponse.json({ meeting: payload });
  } catch (error) {
    console.error('Error skipping meeting:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

/** Undo the pending skip, as long as that meeting hasn't started. */
export async function DELETE() {
  try {
    const loaded = await loadStudentMeeting();
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    const pending = findPendingSkip(loaded.meeting.skips);
    if (!pending) {
      return NextResponse.json({ error: 'There is no upcoming skip to undo.' }, { status: 404 });
    }

    await prisma.skippedMeeting.delete({ where: { id: pending.id } });
    await notifySkipChange(loaded, pending.occurrenceStart, false, pending.reason, null);

    const skips = loaded.meeting.skips.filter((s) => s.id !== pending.id);
    return NextResponse.json({ meeting: meetingPayload(loaded.meeting, skips) });
  } catch (error) {
    console.error('Error undoing meeting skip:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
