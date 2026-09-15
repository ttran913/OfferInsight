import typesData from "@/partnerships/types.json";

export const ECOSYSTEM_CONVERSATION_TYPE = "ecosystem_conversation";

type OpenSourceCreateClient = {
  openSourceEntry: {
    findFirst: (args: {
      where: {
        userId: string;
        partnershipName: string;
        criteriaType: string;
      };
    }) => Promise<{ id: number } | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
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
