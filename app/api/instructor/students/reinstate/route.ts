import { NextRequest, NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { canInstructorMutateUserData } from "@/app/lib/instructor-permissions";
import { CLEARED_BOOKING_CLOCK } from "@/app/lib/must-book";
import { prisma } from "@/db";

export async function POST(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canInstructorMutateUserData(instructor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        removedFromResumeBook: false,
        inactivityWarningCount: 0,
        lastInactivityWarningSent: null,
        ...CLEARED_BOOKING_CLOCK,
      },
      select: {
        id: true,
        removedFromResumeBook: true,
        inactivityWarningCount: true,
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Error reinstating student:", error);
    return NextResponse.json(
      { error: "Failed to reinstate student" },
      { status: 500 }
    );
  }
}
