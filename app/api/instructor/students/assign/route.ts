import { NextRequest, NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { canInstructorAssignStudents } from "@/app/lib/instructor-permissions";
import { MEETING_DURATION_MINUTES } from "@/app/lib/calendar/constants";
import { deleteMonthlyMeetingEvent } from "@/app/lib/calendar/google-calendar";
import {
  buildInstructorChangedEmail,
  buildMonthlyMeetingCancelIcs,
} from "@/app/lib/calendar/ics";
import { anchorLocalDateFromOccurrence } from "@/app/lib/calendar/next-occurrence";
import {
  getInstructorDisplayName,
  resolveDefaultInstructor,
} from "@/app/lib/calendar/scheduling-instructor";
import type { GeneratedSlot } from "@/app/lib/calendar/slots";
import { sendEmail } from "@/app/lib/email";
import { prisma } from "@/db";

/**
 * Assign a student to an instructor (or back to the default with instructorId: null).
 * If the student's existing meeting is with a different instructor than the new
 * effective one, the meeting is cancelled everywhere and the student is emailed to rebook.
 */
export async function POST(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canInstructorAssignStudents(instructor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const instructorId =
      typeof body?.instructorId === "string" && body.instructorId.trim()
        ? body.instructorId.trim()
        : null;
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const target = instructorId
      ? await prisma.instructor.findUnique({ where: { id: instructorId } })
      : null;
    if (instructorId && !target) {
      return NextResponse.json({ error: "Instructor not found" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        monthlyMeeting: {
          include: { instructor: { select: { displayName: true } } },
        },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { assignedInstructorId: instructorId },
    });

    const effective = target ?? (await resolveDefaultInstructor());
    const meeting = user.monthlyMeeting;

    let meetingCancelled = false;
    let emailSent = false;

    if (meeting && effective && meeting.instructorId !== effective.id) {
      if (meeting.googleEventId) {
        await deleteMonthlyMeetingEvent(meeting.instructorId, meeting.googleEventId);
      }
      await prisma.studentMonthlyMeeting.delete({ where: { id: meeting.id } });
      meetingCancelled = true;

      if (user.email) {
        const oldInstructorName = getInstructorDisplayName(meeting.instructor);
        const newInstructorName = getInstructorDisplayName(effective);
        const slot: GeneratedSlot = {
          start: meeting.firstOccurrence.toISOString(),
          end: new Date(
            meeting.firstOccurrence.getTime() + MEETING_DURATION_MINUTES * 60 * 1000
          ).toISOString(),
          dayOfWeek: meeting.dayOfWeek,
          localDate: anchorLocalDateFromOccurrence(meeting.firstOccurrence, meeting.timezone),
          localTime: meeting.localTime,
          weeklyKey: meeting.weeklyKey,
          timezone: meeting.timezone,
        };
        try {
          const ics = buildMonthlyMeetingCancelIcs({
            slot,
            studentName: user.name,
            studentEmail: user.email,
            instructorName: oldInstructorName,
          });
          const mail = buildInstructorChangedEmail({
            studentName: user.name,
            oldInstructorName,
            newInstructorName,
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
                contentType: "text/calendar; charset=utf-8; method=CANCEL",
              },
            ],
          });
          emailSent = true;
        } catch (err) {
          console.error("Failed to send instructor-changed email:", err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      assignedInstructorId: instructorId,
      effectiveInstructorId: effective?.id ?? null,
      meetingCancelled,
      emailSent,
    });
  } catch (error) {
    console.error("Error assigning student to instructor:", error);
    return NextResponse.json({ error: "Failed to assign instructor" }, { status: 500 });
  }
}
