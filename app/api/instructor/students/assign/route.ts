import { NextRequest, NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { canInstructorAssignStudents } from "@/app/lib/instructor-permissions";
import { buildInstructorChangedEmail } from "@/app/lib/calendar/ics";
import {
  getInstructorDisplayName,
  resolveDefaultInstructor,
} from "@/app/lib/calendar/scheduling-instructor";
import { unscheduleMonthlyMeeting } from "@/app/lib/calendar/unschedule";
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
      const oldInstructorName = getInstructorDisplayName(meeting.instructor);
      ({ emailSent } = await unscheduleMonthlyMeeting({
        meeting,
        user,
        instructorName: oldInstructorName,
        mail: buildInstructorChangedEmail({
          studentName: user.name,
          oldInstructorName,
          newInstructorName: getInstructorDisplayName(effective),
        }),
      }));
      meetingCancelled = true;
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
