import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/db";
import { canMutateUserDataForRequest, getUserIdForRequest } from "@/app/lib/api-user-helper";
import type { OpenSourceEntry, OpenSourceStatus } from "@/app/dashboard/components/types";
import {
  entryIncludesHelperVideoUrl,
  helperClickKeyForUrl,
  normalizeHelperVideoUrl,
} from "@/app/dashboard/lib/open-source-baby-step";

type OpenSourceDbEntry = {
  id: number;
  partnershipName: string;
  criteriaType: string | null;
  metric: string | null;
  status: string;
  selectedExtras: unknown;
  babyStepFields: unknown;
  babyStepResponses: unknown;
  userId: string;
};

function toOpenSourceEntry(row: OpenSourceDbEntry): OpenSourceEntry {
  return {
    id: row.id,
    partnershipName: row.partnershipName,
    criteriaType: row.criteriaType,
    metric: row.metric,
    status: row.status as OpenSourceStatus,
    selectedExtras: (row.selectedExtras as string[] | null) ?? [],
    babyStepFields: (row.babyStepFields as OpenSourceEntry["babyStepFields"]) ?? [],
    babyStepResponses: (row.babyStepResponses as OpenSourceEntry["babyStepResponses"]) ?? {},
    userId: row.userId,
  };
}

/**
 * PATCH: Record a baby-step helper click for a tutorial URL and fan it out
 * to every open-source entry for the user that includes that helper_video.
 */
export async function PATCH(request: NextRequest) {
  try {
    const mutationPermission = await canMutateUserDataForRequest(request);
    if (!mutationPermission.allowed) {
      return NextResponse.json(
        { error: mutationPermission.error || "Forbidden" },
        { status: 403 }
      );
    }

    const { userId, error } = await getUserIdForRequest(request);
    if (error || !userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const rawUrl =
      typeof body.helperVideoUrl === "string" ? body.helperVideoUrl.trim() : "";
    if (!rawUrl) {
      return NextResponse.json({ error: "helperVideoUrl is required" }, { status: 400 });
    }

    const normalizedUrl = normalizeHelperVideoUrl(rawUrl);
    const clickKey = helperClickKeyForUrl(normalizedUrl);

    const rows = await prisma.openSourceEntry.findMany({
      where: { userId },
      select: {
        id: true,
        partnershipName: true,
        criteriaType: true,
        metric: true,
        status: true,
        selectedExtras: true,
        babyStepFields: true,
        babyStepResponses: true,
        userId: true,
      },
    });

    const updatedIds: number[] = [];

    for (const row of rows) {
      const entry = toOpenSourceEntry(row as OpenSourceDbEntry);
      if (!entryIncludesHelperVideoUrl(entry, normalizedUrl)) {
        continue;
      }

      const existingResponses =
        (row.babyStepResponses as Record<string, Prisma.InputJsonValue> | null) ?? {};
      if (existingResponses[clickKey]) {
        updatedIds.push(row.id);
        continue;
      }

      const nextResponses: Record<string, Prisma.InputJsonValue> = {
        ...existingResponses,
        [clickKey]: true,
      };
      await prisma.openSourceEntry.update({
        where: { id: row.id },
        data: {
          babyStepResponses: nextResponses,
          dateModified: new Date(),
        },
      });
      updatedIds.push(row.id);
    }

    return NextResponse.json({
      helperVideoUrl: normalizedUrl,
      updatedIds,
      clickKey,
    });
  } catch (err) {
    console.error("Error recording shared helper click:", err);
    return NextResponse.json(
      { error: "Failed to record helper click" },
      { status: 500 }
    );
  }
}
