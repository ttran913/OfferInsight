import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { canMutateUserDataForRequest, getUserIdForRequest } from "@/app/lib/api-user-helper";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import {
  ECOSYSTEM_CONVERSATION_TYPE,
  ensureEcosystemConversationCard,
} from "@/app/lib/open-source-ecosystem-conversation";
import { buildCriteria } from "@/app/lib/partnership-criteria";
import partnershipsData from "@/partnerships/partnerships.json";
import typesData from "@/partnerships/types.json";

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Build all known partnership name aliases (DB + JSON) for safer matching. */
function buildPartnershipAliases(partnershipId: number, dbName?: string | null): string[] {
  const out = new Map<string, string>();
  const add = (value?: string | null) => {
    const raw = (value ?? "").trim();
    if (!raw) return;
    const n = normalizeName(raw);
    if (!out.has(n)) out.set(n, raw);
  };

  add(dbName);
  const fromJson = partnershipsData.partnerships.find(p => p.id === partnershipId)?.name;
  add(fromJson);
  return [...out.values()];
}

function partnershipNameOrWhere(aliasNames: string[]) {
  return aliasNames.map((name) => ({
    partnershipName: { equals: name, mode: "insensitive" as const },
  }));
}

// GET: Fetch user's active partnership and history
export async function GET(request: NextRequest) {
  try {
    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
    }

    // Get active partnership with partnership details
    const activePartnership = await prisma.userPartnership.findFirst({
      where: {
        userId,
        status: "active",
      },
      include: {
        partnership: true,
      },
    });

    // Get completed partnerships (history) with partnership details
    const completedPartnerships = await prisma.userPartnership.findMany({
      where: {
        userId,
        status: "completed",
      },
      include: {
        partnership: true,
      },
      orderBy: {
        completedAt: "desc",
      },
    });

    // If no active partnership, just return completed ones
    if (!activePartnership) {
      return NextResponse.json({
        active: null,
        completed: completedPartnerships.map(p => ({
          ...p,
          partnershipName: p.partnership.name,
          criteria: buildCriteria(p.partnershipId, (p.selections as Record<string, string>) || {}),
        })),
      });
    }

    const activeSelections = activePartnership.selections as Record<string, string> || {};
    const activeResponse = {
      ...activePartnership,
      partnershipName: activePartnership.partnership.name,
      criteria: buildCriteria(activePartnership.partnershipId, activeSelections),
    };

    const completedResponse = completedPartnerships.map(p => ({
      ...p,
      partnershipName: p.partnership.name,
      criteria: buildCriteria(p.partnershipId, (p.selections as Record<string, string>) || {}),
    }));

    return NextResponse.json({
      active: activeResponse,
      completed: completedResponse,
    });
  } catch (error) {
    console.error("Error fetching user partnership:", error);
    return NextResponse.json(
      { error: "Failed to fetch partnership" },
      { status: 500 }
    );
  }
}

// POST: Start a new partnership
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

    const { partnershipId, multipleChoiceSelections } = await request.json();

    if (!partnershipId) {
      return NextResponse.json(
        { error: "Partnership ID is required" },
        { status: 400 }
      );
    }

    // Check if this is an instructor request (userIdParam in URL means instructor)
    const url = new URL(request.url);
    const userIdParam = url.searchParams.get("userId");
    const isInstructor = userIdParam !== null && (await getInstructorSession()) !== null;

    // Check if user already has an active partnership
    const existingActive = await prisma.userPartnership.findFirst({
      where: {
        userId,
        status: "active",
      },
      include: {
        partnership: true,
      },
    });

    if (existingActive && !isInstructor) {
      return NextResponse.json(
        { error: "You already have an active partnership. Complete or abandon it first." },
        { status: 400 }
      );
    }

    // Check if partnership exists
    const partnership = await prisma.partnership.findUnique({
      where: { id: partnershipId },
    });

    if (!partnership) {
      return NextResponse.json(
        { error: "Partnership not found" },
        { status: 404 }
      );
    }

    if (!partnership.isActive) {
      return NextResponse.json(
        { error: "This partnership is no longer available" },
        { status: 400 }
      );
    }

    // Check availability - if switching to a different partnership, we can allow it
    // even if the new partnership is at max capacity because we're freeing up a spot
    // in the old partnership. However, if not switching, check normal availability.
    const isSwitchingToDifferent = existingActive && isInstructor && existingActive.partnershipId !== partnershipId;
    
    if (!isSwitchingToDifferent && partnership.activeUserCount >= partnership.maxUsers) {
      return NextResponse.json(
        { error: "This partnership is full. Please select a different one." },
        { status: 400 }
      );
    }

    // Check if user has already completed this specific partnership - MUST be before
    // any destructive operations (delete cards, abandon) so we don't delete cards
    // and then reject the request
    const alreadyCompleted = await prisma.userPartnership.findFirst({
      where: {
        userId,
        partnershipId,
        status: "completed",
      },
    });

    if (alreadyCompleted) {
      return NextResponse.json(
        { error: "You have already completed this partnership." },
        { status: 400 }
      );
    }

    // If instructor is switching partnerships, abandon the old one and delete only that partnership's cards
    // This happens BEFORE creating the new one to ensure proper count tracking
    if (existingActive && isInstructor) {
      const activeAliases = buildPartnershipAliases(
        existingActive.partnershipId,
        existingActive.partnership?.name
      );
      const completedRows = await prisma.userPartnership.findMany({
        where: { userId, status: "completed" },
        include: { partnership: true },
      });
      const protectedAliases = new Set(
        completedRows
          .flatMap((row) =>
            buildPartnershipAliases(row.partnershipId, row.partnership?.name)
          )
          .map((n) => normalizeName(n))
      );
      const overlap = activeAliases.filter((n) =>
        protectedAliases.has(normalizeName(n))
      );
      if (overlap.length > 0) {
        // Safer to skip deletion than risk removing historical completed cards.
        console.warn(
          "[Partnership] Switch delete skipped due to active/completed alias overlap",
          { userId, activePartnershipId: existingActive.partnershipId, overlap }
        );
      } else {
        const activeOr = partnershipNameOrWhere(activeAliases);
        const [targetCount, totalUserCount] = await Promise.all([
          prisma.openSourceEntry.count({ where: { userId, OR: activeOr } }),
          prisma.openSourceEntry.count({ where: { userId } }),
        ]);
        if (targetCount > totalUserCount) {
          console.warn("[Partnership] Switch delete aborted due to invalid counts", {
            userId,
            targetCount,
            totalUserCount,
            activePartnershipId: existingActive.partnershipId,
          });
        } else {
          if (targetCount === 0) {
            console.info("[Partnership] Switch delete matched no cards", {
              userId,
              activePartnershipId: existingActive.partnershipId,
              activeAliases,
            });
          }
          // Keep completed-history cards from other partnerships intact
          await prisma.openSourceEntry.deleteMany({
            where: {
              userId,
              OR: activeOr,
            },
          });
        }
      }

      // Abandon the old partnership (only if switching to a different one)
      if (existingActive.partnershipId !== partnershipId) {
        await prisma.$transaction(async (tx) => {
          await tx.userPartnership.update({
            where: { id: existingActive.id },
            data: {
              status: "abandoned",
            },
          });

          // Decrement active user count for old partnership
          await tx.partnership.update({
            where: { id: existingActive.partnershipId },
            data: {
              activeUserCount: {
                decrement: 1,
              },
            },
          });
        });
      }
    }

    // Find the partnership definition from the JSON to get criteria
    const partnershipDef = partnershipsData.partnerships.find(p => p.id === partnershipId);
    if (!partnershipDef) {
      return NextResponse.json({ error: "Partnership definition not found" }, { status: 404 });
    }

    // Use transaction to create partnership and increment count atomically
    const result = await prisma.$transaction(async (tx) => {
      // Create new user partnership
      const newPartnership = await tx.userPartnership.create({
        data: {
          userId,
          partnershipId,
          status: "active",
          selections: multipleChoiceSelections || {},
        },
        include: {
          partnership: true,
        },
      });

      // Increment active user count
      await tx.partnership.update({
        where: { id: partnershipId },
        data: {
          activeUserCount: {
            increment: 1,
          },
        },
      });

      // Populate left-most column (Plan) with primary criteria cards
      let mcBlockIndex = 0;
      for (const criteria of partnershipDef.criteria) {
        if (criteria.type === 'multiple_choice' && criteria.choices) {
          // Find what the user selected for this specific block
          const selectedType = multipleChoiceSelections?.[mcBlockIndex];
          const selectedChoice = criteria.choices.find((c: any) => c.type === selectedType);
          
          if (selectedChoice) {
            const typeDef = (typesData.types as any)[selectedChoice.type];
            // ONLY create a separate card if it's a primary criteria
            if (typeDef?.is_primary) {
              for (let i = 0; i < (selectedChoice.count || 1); i++) {
                await tx.openSourceEntry.create({
                  data: {
                    userId,
                    partnershipName: partnershipDef.name,
                    criteriaType: selectedChoice.type,
                    metric: typeDef?.metric || selectedChoice.type,
                    status: "plan",
                    planFields: typeDef?.plan_column_fields || [],
                    planResponses: {},
                    babyStepFields: typeDef?.baby_step_column_fields || [],
                    babyStepResponses: {},
                    proofOfCompletion: typeDef?.proof_of_completion_column_fields || typeDef?.proof_of_completion || [],
                    proofResponses: {},
                    dateModified: new Date(),
                  },
                });
              }
            }
          }
          mcBlockIndex++;
        } else if (criteria.type === ECOSYSTEM_CONVERSATION_TYPE) {
          // Created once via ensureEcosystemConversationCard after the loop
          continue;
        } else {
          // Normal criteria
          const typeDef = (typesData.types as any)[criteria.type];
          
          if (typeDef && typeDef.is_primary) {
            // Create 'count' number of cards for this criteria
            for (let i = 0; i < (criteria.count || 1); i++) {
              await tx.openSourceEntry.create({
                data: {
                  userId,
                  partnershipName: partnershipDef.name,
                  criteriaType: criteria.type,
                  metric: typeDef.metric || criteria.type,
                  status: "plan",
                  planFields: typeDef.plan_column_fields || [],
                  planResponses: {},
                  babyStepFields: typeDef.baby_step_column_fields || [],
                  babyStepResponses: {},
                  proofOfCompletion: typeDef.proof_of_completion_column_fields || typeDef.proof_of_completion || [],
                  proofResponses: {},
                  selectedExtras: [], // Default to empty, user will select which card to attach their chosen extra to
                  dateModified: new Date(),
                },
              });
            }
          }
        }
      }

      await ensureEcosystemConversationCard(tx, userId, partnershipDef.name);

      return newPartnership;
    });

    const responseData = {
      ...result,
      partnershipName: result.partnership.name,
      criteria: buildCriteria(partnershipId, multipleChoiceSelections || {}),
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error creating partnership:", error);
    return NextResponse.json(
      { error: "Failed to create partnership" },
      { status: 500 }
    );
  }
}

// PUT: Update partnership status (complete or abandon)
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

    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: "Partnership ID and status are required" },
        { status: 400 }
      );
    }

    if (!["active", "completed", "abandoned"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'active', 'completed', or 'abandoned'" },
        { status: 400 }
      );
    }

    // Verify the partnership belongs to this user
    const userPartnership = await prisma.userPartnership.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!userPartnership) {
      return NextResponse.json(
        { error: "Partnership not found" },
        { status: 404 }
      );
    }

    const wasActive = userPartnership.status === "active";

    // Use transaction to update status and decrement count atomically
    const result = await prisma.$transaction(async (tx) => {
      // Update the user partnership
      const updatedPartnership = await tx.userPartnership.update({
        where: { id },
        data: {
          status,
          completedAt: status === "completed" ? new Date() : null,
        },
        include: {
          partnership: true,
        },
      });

      // Decrement active user count only when abandoning (not when completing)
      if (wasActive && status === "abandoned") {
        await tx.partnership.update({
          where: { id: userPartnership.partnershipId },
          data: {
            activeUserCount: {
              decrement: 1,
            },
          },
        });
      }

      return updatedPartnership;
    });

    return NextResponse.json({
      ...result,
      partnershipName: result.partnership.name,
    });
  } catch (error) {
    console.error("Error updating partnership:", error);
    return NextResponse.json(
      { error: "Failed to update partnership" },
      { status: 500 }
    );
  }
}

// DELETE: Abandon partnership and delete all cards (for instructors)
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

    // Check if this is an instructor request
    const url = new URL(request.url);
    const userIdParam = url.searchParams.get("userId");
    const isInstructor = userIdParam !== null && (await getInstructorSession()) !== null;

    if (!isInstructor) {
      return NextResponse.json(
        { error: "Only instructors can abandon partnerships for other users" },
        { status: 403 }
      );
    }

    // Find active partnership
    const activePartnership = await prisma.userPartnership.findFirst({
      where: {
        userId,
        status: "active",
      },
      include: {
        partnership: true,
      },
    });

    if (!activePartnership) {
      return NextResponse.json(
        { error: "No active partnership found" },
        { status: 404 }
      );
    }

    // Delete only active partnership cards and abandon partnership
    await prisma.$transaction(async (tx) => {
      const activeAliases = buildPartnershipAliases(
        activePartnership.partnershipId,
        activePartnership.partnership?.name
      );
      const completedRows = await tx.userPartnership.findMany({
        where: { userId, status: "completed" },
        include: { partnership: true },
      });
      const protectedAliases = new Set(
        completedRows
          .flatMap((row) =>
            buildPartnershipAliases(row.partnershipId, row.partnership?.name)
          )
          .map((n) => normalizeName(n))
      );
      const overlap = activeAliases.filter((n) =>
        protectedAliases.has(normalizeName(n))
      );
      if (overlap.length > 0) {
        console.warn(
          "[Partnership] Abandon delete skipped due to active/completed alias overlap",
          { userId, activePartnershipId: activePartnership.partnershipId, overlap }
        );
      } else {
        const activeOr = partnershipNameOrWhere(activeAliases);
        const [targetCount, totalUserCount] = await Promise.all([
          tx.openSourceEntry.count({ where: { userId, OR: activeOr } }),
          tx.openSourceEntry.count({ where: { userId } }),
        ]);
        if (targetCount > totalUserCount) {
          console.warn("[Partnership] Abandon delete aborted due to invalid counts", {
            userId,
            targetCount,
            totalUserCount,
            activePartnershipId: activePartnership.partnershipId,
          });
        } else {
          if (targetCount === 0) {
            console.info("[Partnership] Abandon delete matched no cards", {
              userId,
              activePartnershipId: activePartnership.partnershipId,
              activeAliases,
            });
          }
          // Keep cards from completed/other partnerships
          await tx.openSourceEntry.deleteMany({
            where: {
              userId,
              OR: activeOr,
            },
          });
        }
      }

      // Abandon the partnership
      await tx.userPartnership.update({
        where: { id: activePartnership.id },
        data: {
          status: "abandoned",
        },
      });

      // Decrement active user count
      await tx.partnership.update({
        where: { id: activePartnership.partnershipId },
        data: {
          activeUserCount: {
            decrement: 1,
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error abandoning partnership:", error);
    return NextResponse.json(
      { error: "Failed to abandon partnership" },
      { status: 500 }
    );
  }
}
