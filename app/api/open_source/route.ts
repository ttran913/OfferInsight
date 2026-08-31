import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { canMutateUserDataForRequest, getUserIdForRequest } from "@/app/lib/api-user-helper";
import {
  diffOpenSourceResponseEdits,
  formatOpenSourceCardLabel,
  logOpenSourceColumnMove,
  logOpenSourceFieldEdits,
} from "@/app/lib/open-source-status-log";
import { isUserManagedCriteriaType } from "@/app/lib/open-source-user-managed";
import type { OpenSourceEntry, OpenSourceStatus } from "@/app/dashboard/components/types";
import {
  getPartnershipCriteriaFromCatalog,
  isBabyStepComplete,
  statusRequiresBabyStepComplete,
} from "@/app/dashboard/lib/open-source-baby-step";

type OpenSourceDbEntry = {
  id: number;
  partnershipName: string;
  criteriaType: string | null;
  metric: string | null;
  status: string;
  selectedExtras: unknown;
  planFields: unknown;
  planResponses: unknown;
  babyStepFields: unknown;
  babyStepResponses: unknown;
  proofOfCompletion: unknown;
  proofResponses: unknown;
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
    planFields: (row.planFields as OpenSourceEntry["planFields"]) ?? [],
    planResponses: (row.planResponses as OpenSourceEntry["planResponses"]) ?? {},
    babyStepFields: (row.babyStepFields as OpenSourceEntry["babyStepFields"]) ?? [],
    babyStepResponses: (row.babyStepResponses as OpenSourceEntry["babyStepResponses"]) ?? {},
    proofOfCompletion: (row.proofOfCompletion as OpenSourceEntry["proofOfCompletion"]) ?? [],
    proofResponses: (row.proofResponses as OpenSourceEntry["proofResponses"]) ?? {},
    userId: row.userId,
  };
}

function getBabyStepValidationError(
  existing: OpenSourceDbEntry,
  newStatus: OpenSourceStatus,
  entryForValidation: OpenSourceEntry
): string | null {
  const fromStatus = existing.status as OpenSourceStatus;
  if (!statusRequiresBabyStepComplete(fromStatus, newStatus)) {
    return null;
  }

  const partnershipCriteria = getPartnershipCriteriaFromCatalog(existing.partnershipName);
  if (!isBabyStepComplete(entryForValidation, partnershipCriteria)) {
    return "Complete baby steps first — open each helper and check Done where required.";
  }

  return null;
}

// GET: Fetch all open source entries for a user
export async function GET(request: NextRequest) {
  try {
    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
    }

    const entries = await prisma.openSourceEntry.findMany({
      where: { userId },
      orderBy: { dateCreated: 'desc' },
      // Explicit select keeps this route compatible with DBs that don't yet have newer optional columns.
      select: {
        id: true,
        partnershipName: true,
        criteriaType: true,
        metric: true,
        status: true,
        selectedExtras: true,
        planFields: true,
        planResponses: true,
        babyStepFields: true,
        babyStepResponses: true,
        proofOfCompletion: true,
        proofResponses: true,
        dateCreated: true,
        dateModified: true,
        userId: true,
      },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Error fetching open source entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch open source entries" },
      { status: 500 }
    );
  }
}

// POST: Create a new open source criteria
export async function POST(request: NextRequest) {
  try {
    const mutationPermission = await canMutateUserDataForRequest(request);
    if (!mutationPermission.allowed) {
      return NextResponse.json({ error: mutationPermission.error || "Forbidden" }, { status: 403 });
    }

    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();

    const entry = await prisma.openSourceEntry.create({
      data: {
        partnershipName: data.partnershipName,
        criteriaType: data.criteriaType,
        metric: data.metric,
        status: data.status || "plan",
        selectedExtras: data.selectedExtras || [],
        planFields: data.planFields || [],
        planResponses: data.planResponses || {},
        babyStepFields: data.babyStepFields || [],
        babyStepResponses: data.babyStepResponses || {},
        proofOfCompletion: data.proofOfCompletion || [],
        proofResponses: data.proofResponses || {},
        userId: userId,
        dateCreated: data.dateCreated ? new Date(data.dateCreated) : new Date(),
        dateModified: new Date(),
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Error creating open source criteria:", error);
    return NextResponse.json(
      { error: "Failed to create open source criteria" },
      { status: 500 }
    );
  }
}

// PUT: Update an existing open source criteria
export async function PUT(request: NextRequest) {
  try {
    const mutationPermission = await canMutateUserDataForRequest(request);
    if (!mutationPermission.allowed) {
      return NextResponse.json({ error: mutationPermission.error || "Forbidden" }, { status: 403 });
    }

    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();

    const existing = await prisma.openSourceEntry.findFirst({
      where: { id: data.id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const newStatus = data.status as OpenSourceStatus;
    if (data.status && data.status !== existing.status) {
      const entryForValidation = toOpenSourceEntry({
        ...existing,
        babyStepResponses: data.babyStepResponses ?? existing.babyStepResponses,
        selectedExtras: data.selectedExtras ?? existing.selectedExtras,
        babyStepFields: data.babyStepFields ?? existing.babyStepFields,
        criteriaType: data.criteriaType ?? existing.criteriaType,
      });
      const babyStepError = getBabyStepValidationError(existing, newStatus, entryForValidation);
      if (babyStepError) {
        return NextResponse.json({ error: babyStepError }, { status: 400 });
      }
    }

    const entry = await prisma.openSourceEntry.update({
      where: { id: data.id, userId: userId },
      data: {
        partnershipName: data.partnershipName,
        criteriaType: data.criteriaType,
        metric: data.metric,
        status: data.status,
        selectedExtras: data.selectedExtras,
        planFields: data.planFields,
        planResponses: data.planResponses,
        babyStepFields: data.babyStepFields,
        babyStepResponses: data.babyStepResponses,
        proofOfCompletion: data.proofOfCompletion,
        proofResponses: data.proofResponses,
        dateModified: new Date(),
      },
    });

    const updatedCardLabel = formatOpenSourceCardLabel(entry);

    if (data.status && data.status !== existing.status) {
      await logOpenSourceColumnMove({
        userId,
        entryId: entry.id,
        cardLabel: updatedCardLabel,
        fromStatus: existing.status,
        toStatus: data.status,
      });
    }

    const fieldEdits = diffOpenSourceResponseEdits(existing, {
      planResponses: data.planResponses,
      babyStepResponses: data.babyStepResponses,
      proofResponses: data.proofResponses,
    });

    await logOpenSourceFieldEdits({
      userId,
      entryId: entry.id,
      cardLabel: updatedCardLabel,
      edits: fieldEdits,
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Error updating open source criteria:", error);
    return NextResponse.json(
      { error: "Failed to update open source criteria" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a single open source entry (only issue-type cards are deletable)
export async function DELETE(request: NextRequest) {
  try {
    const mutationPermission = await canMutateUserDataForRequest(request);
    if (!mutationPermission.allowed) {
      return NextResponse.json({ error: mutationPermission.error || "Forbidden" }, { status: 403 });
    }

    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const existing = await prisma.openSourceEntry.findFirst({
      where: { id: parseInt(id, 10), userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (!isUserManagedCriteriaType(existing.criteriaType)) {
      return NextResponse.json(
        { error: "Only user-managed cards can be deleted." },
        { status: 403 }
      );
    }

    await prisma.openSourceEntry.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting open source entry:", error);
    return NextResponse.json(
      { error: "Failed to delete open source entry" },
      { status: 500 }
    );
  }
}

// PATCH: Update status only (for drag and drop)
export async function PATCH(request: NextRequest) {
  try {
    const mutationPermission = await canMutateUserDataForRequest(request);
    if (!mutationPermission.allowed) {
      return NextResponse.json({ error: mutationPermission.error || "Forbidden" }, { status: 403 });
    }

    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const { status } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: "ID and status are required" }, { status: 400 });
    }

    const entryId = parseInt(id, 10);
    const existing = await prisma.openSourceEntry.findFirst({
      where: { id: entryId, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const newStatus = status as OpenSourceStatus;
    const babyStepError = getBabyStepValidationError(
      existing,
      newStatus,
      toOpenSourceEntry(existing)
    );
    if (babyStepError) {
      return NextResponse.json({ error: babyStepError }, { status: 400 });
    }

    const entry = await prisma.openSourceEntry.update({
      where: { id: entryId, userId: userId },
      data: {
        status: status,
        dateModified: new Date(),
      },
    });

    await logOpenSourceColumnMove({
      userId,
      entryId: entry.id,
      cardLabel: formatOpenSourceCardLabel(entry),
      fromStatus: existing.status,
      toStatus: status,
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Error updating status:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
