import { NextRequest, NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { canInstructorMutateUserData } from "@/app/lib/instructor-permissions";
import { buildMeetingCancelledEmail } from "@/app/lib/calendar/ics";
import { seriesAnchorSlot } from "@/app/lib/calendar/next-occurrence";
import { getInstructorDisplayName } from "@/app/lib/calendar/scheduling-instructor";
import { unscheduleMonthlyMeeting } from "@/app/lib/calendar/unschedule";
import { prisma } from "@/db";

/**
 * Cancel a student's monthly 1:1 series without starting the "book a new 1:1" clock,
 * e.g. for test accounts or meetings outside the instructor's current hours.
 */
export async function POST(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    const emailStudent = body?.emailStudent !== false;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        monthlyMeeting: { include: { instructor: { select: { displayName: true } } } },
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

    const instructorName = getInstructorDisplayName(meeting.instructor);
    const { emailSent } = await unscheduleMonthlyMeeting({
      meeting,
      user,
      instructorName,
      mail: emailStudent
        ? buildMeetingCancelledEmail({
            studentName: user.name,
            instructorName,
            slot: seriesAnchorSlot(meeting),
          })
        : undefined,
      cancelledBecause:
        meeting.instructorId === instructor.id
          ? "you cancelled it from the instructor dashboard"
          : `${getInstructorDisplayName(instructor)} cancelled it from the instructor dashboard`,
    });

    return NextResponse.json({ success: true, emailSent });
  } catch (error) {
    console.error("Error cancelling monthly meeting:", error);
    return NextResponse.json({ error: "Failed to cancel meeting" }, { status: 500 });
  }
}
