import { NextRequest, NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { prisma } from "@/db";
import { openSourceStatusLabel } from "@/app/lib/open-source-status-log";

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const since = new Date(Date.now() - THREE_MONTHS_MS);

    const changes = await prisma.openSourceStatusChange.findMany({
      where: {
        userId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      changes: changes.map((change) => ({
        id: change.id,
        entryId: change.entryId,
        cardLabel: change.cardLabel,
        eventType: change.eventType,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        fromStatusLabel: change.fromStatus ? openSourceStatusLabel(change.fromStatus) : null,
        toStatusLabel: change.toStatus ? openSourceStatusLabel(change.toStatus) : null,
        fieldLabel: change.fieldLabel,
        fieldValue: change.fieldValue,
        createdAt: change.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching open source status changes:", error);
    return NextResponse.json(
      { error: "Failed to fetch open source status changes" },
      { status: 500 }
    );
  }
}
