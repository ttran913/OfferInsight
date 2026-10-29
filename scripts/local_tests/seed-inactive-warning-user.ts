import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import partnershipsData from "../../partnerships/partnerships.json";
import typesData from "../../partnerships/types.json";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter }) as any;

const TEST_EMAIL = "local.inactive.warning.krishna@example.com";
const TEST_NAME = "Local Inactive Warning User";
const KRISHNA_PARTNERSHIP_ID = 2;
const BACKDATED_CARD_DATE = new Date("2026-02-25T12:00:00.000Z");

type JsonField = {
  type?: string;
  text?: string;
  helper_video?: string;
};

type TypeDef = {
  is_primary?: boolean;
  metric?: string;
  plan_column_fields?: JsonField[];
  baby_step_column_fields?: JsonField[];
  proof_of_completion_column_fields?: JsonField[];
  proof_of_completion?: JsonField[];
};

function resolveKrishnaCards() {
  const partnership = partnershipsData.partnerships.find((p) => p.id === KRISHNA_PARTNERSHIP_ID);
  if (!partnership) {
    throw new Error("Krishna partnership definition not found in partnerships.json");
  }

  return {
    partnershipName: partnership.name,
    criteria: partnership.criteria,
  };
}

async function main() {
  const now = Date.now();
  const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000);
  const { partnershipName, criteria } = resolveKrishnaCards();

  await prisma.partnership.upsert({
    where: { id: KRISHNA_PARTNERSHIP_ID },
    update: {
      name: partnershipName,
    },
    create: {
      id: KRISHNA_PARTNERSHIP_ID,
      name: partnershipName,
      linkedIn: "",
      company: "",
      role: "",
      activeUserCount: 0,
      maxUsers: 5,
      isActive: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {
      name: TEST_NAME,
      inactivityWarningCount: 2,
      lastInactivityWarningSent: eightDaysAgo,
      removedFromResumeBook: false,
    },
    create: {
      name: TEST_NAME,
      email: TEST_EMAIL,
      inactivityWarningCount: 2,
      lastInactivityWarningSent: eightDaysAgo,
      removedFromResumeBook: false,
    },
    select: { id: true, email: true },
  });

  // Keep this seed deterministic by clearing prior board/test records.
  await prisma.applications_With_Outreach.deleteMany({ where: { userId: user.id } });
  await prisma.networking.deleteMany({ where: { userId: user.id } });
  await prisma.openSourceEntry.deleteMany({ where: { userId: user.id } });
  await prisma.userPartnership.deleteMany({ where: { userId: user.id } });

  await prisma.userPartnership.create({
    data: {
      userId: user.id,
      partnershipId: KRISHNA_PARTNERSHIP_ID,
      status: "active",
      startedAt: BACKDATED_CARD_DATE,
      selections: {},
    },
  });

  const typeDefs = (typesData.types ?? {}) as Record<string, TypeDef>;
  const entriesToCreate: any[] = [];

  for (const criterion of criteria as any[]) {
    if (criterion.type === "multiple_choice") continue;
    const typeDef = typeDefs[criterion.type] ?? {};
    if (!typeDef.is_primary) continue;

    const count = criterion.count || 1;
    for (let i = 0; i < count; i++) {
      entriesToCreate.push({
        userId: user.id,
        partnershipName,
        criteriaType: criterion.type,
        metric: typeDef.metric ?? criterion.type,
        status: "plan",
        planFields: typeDef.plan_column_fields ?? [],
        planResponses: {},
        babyStepFields: typeDef.baby_step_column_fields ?? [],
        babyStepResponses: {},
        proofOfCompletion: typeDef.proof_of_completion_column_fields ?? typeDef.proof_of_completion ?? [],
        proofResponses: {},
        selectedExtras: [],
        dateCreated: BACKDATED_CARD_DATE,
        dateModified: BACKDATED_CARD_DATE,
      });
    }
  }

  if (entriesToCreate.length === 0) {
    throw new Error("No primary criteria cards were generated for Krishna partnership");
  }

  await prisma.openSourceEntry.createMany({ data: entriesToCreate });

  console.log("Local inactive warning test user seeded.");
  console.log(`Email: ${user.email}`);
  console.log("State: inactivityWarningCount=2, last warning sent 8+ days ago, inactive 30+ days.");
  console.log(`Cards seeded in fresh layout (all in plan) from partnership contract. Total cards: ${entriesToCreate.length}.`);
  console.log(`All card dates backdated to ${BACKDATED_CARD_DATE.toISOString().slice(0, 10)}.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed local inactive warning user:", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
