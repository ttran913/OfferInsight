import { NextRequest, NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { prisma } from "@/db";
import { buildCriteria } from "@/app/lib/partnership-criteria";
import { computeCrossPartnershipProgressList } from "@/app/lib/open-source-criteria-progress";
import partnershipsData from "@/partnerships/partnerships.json";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await context.params;
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [doneEntries, userPartnerships] = await Promise.all([
      prisma.openSourceEntry.findMany({
        where: { userId, status: "done" },
        select: {
          criteriaType: true,
          selectedExtras: true,
        },
      }),
      prisma.userPartnership.findMany({
        where: {
          userId,
          status: { in: ["active", "completed"] },
        },
        select: {
          partnershipId: true,
          selections: true,
        },
      }),
    ]);

    const knownCriteriaByPartnershipId: Record<number, ReturnType<typeof buildCriteria>> =
      {};
    for (const up of userPartnerships) {
      const selections = (up.selections as Record<string, string>) || {};
      knownCriteriaByPartnershipId[up.partnershipId] = buildCriteria(
        up.partnershipId,
        selections
      );
    }

    const partnerships = partnershipsData.partnerships.map((p) => ({
      id: p.id,
      name: p.name,
      criteria: p.criteria,
    }));

    const progress = computeCrossPartnershipProgressList(
      partnerships,
      doneEntries,
      knownCriteriaByPartnershipId
    );

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Error fetching shared partnership progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
