import { NextRequest, NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { canInstructorMutateUserData } from "@/app/lib/instructor-permissions";
import { previousMeeting } from "@/app/lib/calendar/moves";
import { formatNextMeetingLabel } from "@/app/lib/calendar/next-occurrence";
import { getInstructorDisplayName } from "@/app/lib/calendar/scheduling-instructor";
import { unscheduleMonthlyMeeting } from "@/app/lib/calendar/unschedule";
import { buildMissedMeetingEmail } from "@/app/lib/email";
import {
  bookByDate,
  CLEARED_BOOKING_CLOCK,
  deadlineLabel,
  startedBookingClock,
} from "@/app/lib/must-book";
import { prisma } from "@/db";

async function readUserId(request: NextRequest): Promise<string> {
  const body = await request.json().catch(() => null);
  return typeof body?.userId === "string" ? body.userId.trim() : "";
}

/**
 * Mark the student's most recent past 1:1 as missed. Their whole monthly schedule is
 * cancelled and the 72h/96h "book a new 1:1" clock starts.
 */
export async function POST(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await readUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        removedFromResumeBook: true,
        monthlyMeeting: {
          include: {
            moves: { select: { originalStart: true, newStart: true } },
            instructor: { select: { displayName: true } },
          },
        },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const meeting = user.monthlyMeeting;
    if (!meeting) {
      return NextResponse.json(
        { error: "This student has no monthly meeting scheduled." },
        { status: 409 }
      );
    }
    if (meeting.instructorId !== instructor.id && !canInstructorMutateUserData(instructor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const missedStart = previousMeeting(meeting, meeting.moves, now);
    if (!missedStart) {
      return NextResponse.json(
        { error: "This student hasn't had a meeting yet." },
        { status: 409 }
      );
    }

    const startClock = !user.removedFromResumeBook;
    const [, , missedCount] = await prisma.$transaction([
      prisma.missedMeeting.upsert({
        where: { userId_occurrenceStart: { userId, occurrenceStart: missedStart } },
        create: { userId, occurrenceStart: missedStart, markedByInstructorId: instructor.id },
        update: {},
      }),
      prisma.user.update({
        where: { id: userId },
        data: startClock ? startedBookingClock("missedMeeting", now) : {},
      }),
      prisma.missedMeeting.count({ where: { userId } }),
    ]);

    const instructorName = getInstructorDisplayName(meeting.instructor);
    const { emailSent } = await unscheduleMonthlyMeeting({
      meeting,
      user,
      instructorName,
      mail: buildMissedMeetingEmail({
        studentName: user.name,
        instructorName,
        missedLabel: formatNextMeetingLabel(missedStart.toISOString(), meeting.timezone),
        bookByLabel: deadlineLabel(bookByDate(now)),
      }),
    });

    return NextResponse.json({
      success: true,
      missedStart: missedStart.toISOString(),
      missedCount,
      emailSent,
    });
  } catch (error) {
    console.error("Error marking missed meeting:", error);
    return NextResponse.json({ error: "Failed to mark missed meeting" }, { status: 500 });
  }
}

/**
 * Undo a missed mark: deletes the latest missed record and stops the clock. The old
 * schedule is not restored, so the student still has to book a new one.
 */
export async function DELETE(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await readUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        mustBookReason: true,
        missedMeetings: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const latest = user.missedMeetings[0];
    if (user.mustBookReason !== "missedMeeting" || !latest) {
      return NextResponse.json({ error: "There is no missed meeting to undo." }, { status: 409 });
    }
    if (latest.markedByInstructorId !== instructor.id && !canInstructorMutateUserData(instructor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [, , missedCount] = await prisma.$transaction([
      prisma.missedMeeting.delete({ where: { id: latest.id } }),
      prisma.user.update({ where: { id: userId }, data: CLEARED_BOOKING_CLOCK }),
      prisma.missedMeeting.count({ where: { userId } }),
    ]);

    return NextResponse.json({ success: true, missedCount });
  } catch (error) {
    console.error("Error undoing missed meeting:", error);
    return NextResponse.json({ error: "Failed to undo missed meeting" }, { status: 500 });
  }
}
