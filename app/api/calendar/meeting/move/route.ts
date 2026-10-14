import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { moveMonthlyMeetingOccurrence } from '@/app/lib/calendar/google-calendar';
import {
  buildMeetingMoveInstructorEmail,
  buildMeetingMoveStudentEmail,
  buildMovedOccurrenceIcs,
} from '@/app/lib/calendar/ics';
import { emailInstructor } from '@/app/lib/calendar/instructor-email';
import { meetingPayload } from '@/app/lib/calendar/meeting-payload';
import { oneTimeMoveTarget, type MoveFields } from '@/app/lib/calendar/moves';
import { formatNextMeetingLabel, seriesAnchorSlot } from '@/app/lib/calendar/next-occurrence';
import { getInstructorDisplayName } from '@/app/lib/calendar/scheduling-instructor';
import { loadOneTimeOptions } from '@/app/lib/calendar/student-booking';
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
          moves: { select: { originalStart: true, newStart: true } },
          instructor: { select: { displayName: true } },
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

/** Google Calendar + student/instructor emails for a one-time move, or its undo. */
async function notifyMoveChange(
  { user, meeting }: Loaded,
  moves: MoveFields[],
  originalStart: Date,
  newStart: Date
) {
  const undone = originalStart.getTime() === newStart.getTime();
  const instructorName = getInstructorDisplayName(meeting.instructor);
  const originalLabel = formatNextMeetingLabel(originalStart.toISOString(), meeting.timezone);
  const newLabel = formatNextMeetingLabel(newStart.toISOString(), meeting.timezone);

  if (meeting.googleEventId) {
    try {
      await moveMonthlyMeetingOccurrence(
        meeting.instructorId,
        meeting.googleEventId,
        originalStart,
        newStart
      );
    } catch (err) {
      console.error('Failed to move occurrence on Google Calendar:', err);
    }
  }

  try {
    const ics = buildMovedOccurrenceIcs({
      slot: seriesAnchorSlot(meeting),
      studentName: user.name,
      studentEmail: user.email,
      instructorName,
      originalStart: originalStart.toISOString(),
      newStart: newStart.toISOString(),
    });
    const mail = buildMeetingMoveStudentEmail({
      studentName: user.name,
      instructorName,
      originalLabel,
      newLabel,
      scheduleLabel: meetingPayload(meeting, moves).scheduleLabel,
      undone,
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
  } catch (err) {
    console.error('Failed to send move email to student:', err);
  }

  await emailInstructor(
    meeting.instructorId,
    buildMeetingMoveInstructorEmail({
      studentName: user.name || user.email,
      originalLabel,
      newLabel,
      undone,
    })
  );
}

/** The meeting that can be moved one time, and the open times it can move to. */
export async function GET() {
  try {
    const loaded = await loadStudentMeeting();
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }
    const { meeting } = loaded;
    const { target, days } = await loadOneTimeOptions(meeting);
    if (!target) {
      return NextResponse.json({ error: 'No upcoming meeting to move.' }, { status: 404 });
    }

    const tz = meeting.timezone;
    return NextResponse.json({
      timezone: tz,
      original: {
        start: target.originalStart.toISOString(),
        label: formatNextMeetingLabel(target.originalStart.toISOString(), tz),
      },
      current: target.move
        ? {
            start: target.move.newStart.toISOString(),
            label: formatNextMeetingLabel(target.move.newStart.toISOString(), tz),
          }
        : null,
      followingLabel: target.followingStart
        ? formatNextMeetingLabel(target.followingStart.toISOString(), tz)
        : null,
      days: days.map((d) => ({
        localDate: d.localDate,
        dayOfWeek: d.dayOfWeek,
        times: d.slots.map((s) => s.localTime),
      })),
    });
  } catch (error) {
    console.error('Error loading one-time move options:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

/** Move the next meeting to another open time, one time only; the regular schedule is unchanged. */
export async function POST(request: NextRequest) {
  try {
    const loaded = await loadStudentMeeting();
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }
    const { meeting } = loaded;

    const body = await request.json().catch(() => ({}));
    const localDate = typeof body?.localDate === 'string' ? body.localDate.trim() : '';
    const localTime = typeof body?.localTime === 'string' ? body.localTime.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}$/.test(localTime)) {
      return NextResponse.json(
        { error: 'localDate (YYYY-MM-DD) and localTime (HH:mm) are required' },
        { status: 400 }
      );
    }

    const { target, days } = await loadOneTimeOptions(meeting);
    if (!target) {
      return NextResponse.json({ error: 'No upcoming meeting to move.' }, { status: 404 });
    }
    const slot = days
      .find((d) => d.localDate === localDate)
      ?.slots.find((s) => s.localTime === localTime);
    if (!slot) {
      return NextResponse.json(
        { error: 'That time is no longer available. Pick another.' },
        { status: 409 }
      );
    }

    const newStart = new Date(slot.start);
    await prisma.movedMeeting.upsert({
      where: {
        meetingId_originalStart: { meetingId: meeting.id, originalStart: target.originalStart },
      },
      create: { meetingId: meeting.id, originalStart: target.originalStart, newStart },
      update: { newStart },
    });

    const moves = [
      ...meeting.moves.filter((m) => m.originalStart.getTime() !== target.originalStart.getTime()),
      { originalStart: target.originalStart, newStart },
    ];
    await notifyMoveChange(loaded, moves, target.originalStart, newStart);
    return NextResponse.json({ meeting: meetingPayload(meeting, moves) });
  } catch (error) {
    console.error('Error moving meeting:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

/** Undo the one-time move: the meeting goes back to its regular time, if that's still ahead. */
export async function DELETE() {
  try {
    const loaded = await loadStudentMeeting();
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }
    const { meeting } = loaded;

    const move = oneTimeMoveTarget(meeting, meeting.moves)?.move;
    if (!move) {
      return NextResponse.json({ error: 'There is no one-time move to undo.' }, { status: 404 });
    }
    if (move.originalStart <= new Date()) {
      return NextResponse.json(
        { error: 'The regular time for that meeting has already passed, so it can’t be moved back.' },
        { status: 409 }
      );
    }

    await prisma.movedMeeting.delete({
      where: {
        meetingId_originalStart: { meetingId: meeting.id, originalStart: move.originalStart },
      },
    });

    const moves = meeting.moves.filter(
      (m) => m.originalStart.getTime() !== move.originalStart.getTime()
    );
    await notifyMoveChange(loaded, moves, move.originalStart, move.originalStart);
    return NextResponse.json({ meeting: meetingPayload(meeting, moves) });
  } catch (error) {
    console.error('Error undoing meeting move:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
