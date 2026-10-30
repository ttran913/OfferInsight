import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { canMutateUserDataForRequest, getUserIdForRequest } from "@/app/lib/api-user-helper";

const VALID_NICHE_TYPES = new Set([
  "openSource",
  "techEvent",
  "hobby",
  "alumni",
  "other",
]);

const VALID_STATUSES = new Set([
  "niche",
  "vibe",
  "discover",
  "offerValue",
  "pitch",
]);

// GET all networking cards for the logged-in user (or specified user if instructor)
export async function GET(request: NextRequest) {
  try {
    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
    }

    const cards = await prisma.networking.findMany({
      where: { userId },
      orderBy: { id: "desc" },
    });

    return NextResponse.json(cards);
  } catch (error) {
    console.error("Error fetching networking cards:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch networking cards", details: errorMessage },
      { status: 500 }
    );
  }
}

// POST a new networking card
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

    const body = await request.json();
    const {
      nicheType,
      nicheName,
      contactName,
      contactLinkedInUrl,
      buildTrust,
      summary,
      artifact,
      pitchAsk,
      pitchResult,
      status,
      dateCreated,
      dateModified,
    } = body;

    if (!nicheType || !VALID_NICHE_TYPES.has(nicheType)) {
      return NextResponse.json({ error: "Valid niche type is required" }, { status: 400 });
    }

    if (!nicheName || typeof nicheName !== "string" || !nicheName.trim()) {
      return NextResponse.json({ error: "Niche name is required" }, { status: 400 });
    }

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const card = await prisma.networking.create({
      data: {
        nicheType,
        nicheName: nicheName.trim(),
        contactName: contactName || null,
        contactLinkedInUrl: contactLinkedInUrl || null,
        buildTrust: buildTrust || null,
        summary: summary || null,
        artifact: artifact || null,
        pitchAsk: pitchAsk || null,
        pitchResult: pitchResult || null,
        status: status || "niche",
        userId,
        dateCreated: dateCreated ? new Date(dateCreated) : undefined,
        dateModified: dateModified ? new Date(dateModified) : new Date(),
      },
    });

    return NextResponse.json(card);
  } catch (error) {
    console.error("Error creating networking card:", error);
    return NextResponse.json(
      { error: "Failed to create networking card" },
      { status: 500 }
    );
  }
}

// PATCH to update just the status (drag and drop)
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

    const body = await request.json();
    const { status } = body;

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Networking card ID is required" }, { status: 400 });
    }

    if (status === undefined || !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Valid status is required" }, { status: 400 });
    }

    const existing = await prisma.networking.findFirst({
      where: { id: parseInt(id), userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Networking card not found" }, { status: 404 });
    }

    if (status === existing.status) {
      return NextResponse.json(existing);
    }

    const updated = await prisma.networking.update({
      where: { id: parseInt(id) },
      data: {
        status,
        dateModified: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating networking status:", error);
    return NextResponse.json(
      { error: "Failed to update networking status" },
      { status: 500 }
    );
  }
}

// PUT full update
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

    const body = await request.json();
    const {
      id,
      nicheType,
      nicheName,
      contactName,
      contactLinkedInUrl,
      buildTrust,
      summary,
      artifact,
      pitchAsk,
      pitchResult,
      status,
      dateCreated,
      dateModified,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Networking card ID is required" }, { status: 400 });
    }

    const existing = await prisma.networking.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Networking card not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    let hasChanges = false;

    if (status !== undefined && VALID_STATUSES.has(status) && status !== existing.status) {
      updateData.status = status;
      hasChanges = true;
    }
    if (nicheType !== undefined && VALID_NICHE_TYPES.has(nicheType) && nicheType !== existing.nicheType) {
      updateData.nicheType = nicheType;
      hasChanges = true;
    }
    if (nicheName !== undefined && nicheName !== existing.nicheName) {
      updateData.nicheName = nicheName;
      hasChanges = true;
    }
    if (contactName !== undefined && contactName !== existing.contactName) {
      updateData.contactName = contactName || null;
      hasChanges = true;
    }
    if (contactLinkedInUrl !== undefined && contactLinkedInUrl !== existing.contactLinkedInUrl) {
      updateData.contactLinkedInUrl = contactLinkedInUrl || null;
      hasChanges = true;
    }
    if (buildTrust !== undefined && buildTrust !== existing.buildTrust) {
      updateData.buildTrust = buildTrust || null;
      hasChanges = true;
    }
    if (summary !== undefined && summary !== existing.summary) {
      updateData.summary = summary || null;
      hasChanges = true;
    }
    if (artifact !== undefined && artifact !== existing.artifact) {
      updateData.artifact = artifact || null;
      hasChanges = true;
    }
    if (pitchAsk !== undefined && pitchAsk !== existing.pitchAsk) {
      updateData.pitchAsk = pitchAsk || null;
      hasChanges = true;
    }
    if (pitchResult !== undefined && pitchResult !== existing.pitchResult) {
      updateData.pitchResult = pitchResult || null;
      hasChanges = true;
    }
    if (dateCreated !== undefined) {
      const newDateCreated = new Date(dateCreated);
      if (newDateCreated.getTime() !== existing.dateCreated.getTime()) {
        updateData.dateCreated = newDateCreated;
        hasChanges = true;
      }
    }
    if (dateModified !== undefined) {
      if (dateModified === null) {
        updateData.dateModified = null;
        hasChanges = true;
      } else {
        const newDateModified = new Date(dateModified);
        const existingDateModified = existing.dateModified
          ? new Date(existing.dateModified)
          : null;
        if (!existingDateModified || newDateModified.getTime() !== existingDateModified.getTime()) {
          updateData.dateModified = newDateModified;
          hasChanges = true;
        }
      }
    } else if (hasChanges) {
      updateData.dateModified = new Date();
    }

    if (hasChanges) {
      const updated = await prisma.networking.update({
        where: { id },
        data: updateData,
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json(existing);
  } catch (error) {
    console.error("Error updating networking card:", error);
    return NextResponse.json(
      { error: "Failed to update networking card" },
      { status: 500 }
    );
  }
}

// DELETE a networking card
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
      return NextResponse.json({ error: "Networking card ID is required" }, { status: 400 });
    }

    const card = await prisma.networking.findFirst({
      where: { id: parseInt(id), userId },
    });

    if (!card) {
      return NextResponse.json({ error: "Networking card not found" }, { status: 404 });
    }

    await prisma.networking.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting networking card:", error);
    return NextResponse.json(
      { error: "Failed to delete networking card" },
      { status: 500 }
    );
  }
}
