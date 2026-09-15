import typesData from "@/partnerships/types.json";
import { prisma } from "@/db";

export const ECOSYSTEM_CONVERSATION_TYPE = "ecosystem_conversation";

/** Prisma client or interactive transaction client with openSourceEntry access. */
type OpenSourceCreateClient = {
  openSourceEntry: Pick<typeof prisma.openSourceEntry, "findFirst" | "create">;
};

/** Ensure exactly one ecosystem conversation card exists for this user + partnership. */
export async function ensureEcosystemConversationCard(
  db: OpenSourceCreateClient,
  userId: string,
  partnershipName: string
): Promise<{ created: boolean }> {
  const existing = await db.openSourceEntry.findFirst({
    where: {
      userId,
      partnershipName,
      criteriaType: ECOSYSTEM_CONVERSATION_TYPE,
    },
  });
  if (existing) {
    return { created: false };
  }

  const typeDef = (typesData.types as Record<string, any>)[ECOSYSTEM_CONVERSATION_TYPE];
  if (!typeDef) {
    throw new Error("ecosystem_conversation type definition missing");
  }

  await db.openSourceEntry.create({
    data: {
      userId,
      partnershipName,
      criteriaType: ECOSYSTEM_CONVERSATION_TYPE,
      metric: typeDef.metric || ECOSYSTEM_CONVERSATION_TYPE,
      status: "plan",
      planFields: typeDef.plan_column_fields || [],
      planResponses: {},
      babyStepFields: typeDef.baby_step_column_fields || [],
      babyStepResponses: {},
      proofOfCompletion:
        typeDef.proof_of_completion_column_fields ||
        typeDef.proof_of_completion ||
        [],
      proofResponses: {},
      selectedExtras: [],
      dateModified: new Date(),
    },
  });

  return { created: true };
}
