jest.mock("@/db", () => ({
  prisma: {
    userPartnership: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    openSourceEntry: {
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    partnership: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/app/lib/api-user-helper", () => ({
  canMutateUserDataForRequest: jest.fn(),
  getUserIdForRequest: jest.fn(),
}));

jest.mock("@/app/lib/instructor-auth", () => ({
  getInstructorSession: jest.fn(),
}));

import { DELETE, POST } from "@/app/api/users/partnership/route";
import { prisma } from "@/db";
import { canMutateUserDataForRequest, getUserIdForRequest } from "@/app/lib/api-user-helper";
import { getInstructorSession } from "@/app/lib/instructor-auth";

const mockPrisma = prisma as any;
const mockCanMutate = canMutateUserDataForRequest as jest.Mock;
const mockGetUserId = getUserIdForRequest as jest.Mock;
const mockGetInstructorSession = getInstructorSession as jest.Mock;

describe("DELETE /api/users/partnership safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes only active-partnership cards and keeps completed-partnership cards", async () => {
    mockCanMutate.mockResolvedValue({ allowed: true });
    mockGetUserId.mockResolvedValue({ userId: "user-1", error: null });
    mockGetInstructorSession.mockResolvedValue({ instructorId: "inst-1" });

    mockPrisma.userPartnership.findFirst.mockResolvedValue({
      id: 88,
      userId: "user-1",
      partnershipId: 7,
      status: "active",
      partnership: { id: 7, name: "Kevin M." },
    });

    const tx = {
      userPartnership: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 55,
            userId: "user-1",
            partnershipId: 5,
            status: "completed",
            partnership: { id: 5, name: "Completed Partner" },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      openSourceEntry: {
        count: jest
          .fn()
          .mockResolvedValueOnce(2) // targetCount
          .mockResolvedValueOnce(8), // totalUserCount
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      partnership: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const response = await DELETE(
      new Request("http://localhost/api/users/partnership?userId=user-1", {
        method: "DELETE",
      }) as any
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    expect(tx.openSourceEntry.deleteMany).toHaveBeenCalledTimes(1);
    const deleteArgs = tx.openSourceEntry.deleteMany.mock.calls[0][0];

    expect(deleteArgs.where.userId).toBe("user-1");
    expect(deleteArgs.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          partnershipName: expect.objectContaining({ equals: "Kevin M." }),
        }),
      ])
    );
    expect(deleteArgs.where.OR).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          partnershipName: expect.objectContaining({ equals: "Completed Partner" }),
        }),
      ])
    );
  });
});

describe("POST /api/users/partnership switch safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("on instructor switch, deletes only previous active-partnership cards", async () => {
    mockCanMutate.mockResolvedValue({ allowed: true });
    mockGetUserId.mockResolvedValue({ userId: "user-1", error: null });
    mockGetInstructorSession.mockResolvedValue({ instructorId: "inst-1" });

    mockPrisma.userPartnership.findFirst
      .mockResolvedValueOnce({
        id: 88,
        userId: "user-1",
        partnershipId: 7,
        status: "active",
        partnership: { id: 7, name: "Kevin M." },
      })
      .mockResolvedValueOnce(null); // alreadyCompleted

    mockPrisma.partnership.findUnique.mockResolvedValue({
      id: 9,
      isActive: true,
      activeUserCount: 0,
      maxUsers: 5,
      name: "New Partner",
    });

    mockPrisma.userPartnership.findMany.mockResolvedValue([
      {
        id: 55,
        userId: "user-1",
        partnershipId: 5,
        status: "completed",
        partnership: { id: 5, name: "Completed Partner" },
      },
    ]);

    mockPrisma.openSourceEntry.count
      .mockResolvedValueOnce(2) // targetCount
      .mockResolvedValueOnce(8); // totalUserCount
    mockPrisma.openSourceEntry.deleteMany.mockResolvedValue({ count: 2 });

    mockPrisma.$transaction.mockImplementation(async (arg: any) => {
      if (typeof arg === "function") {
        const tx = {
          userPartnership: {
            update: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({
              id: 99,
              userId: "user-1",
              partnershipId: 9,
              status: "active",
              selections: {},
              partnership: { id: 9, name: "New Partner" },
            }),
          },
          partnership: {
            update: jest.fn().mockResolvedValue({}),
          },
          openSourceEntry: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return arg(tx);
      }
      return [];
    });

    const response = await POST(
      new Request("http://localhost/api/users/partnership?userId=user-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnershipId: 9, multipleChoiceSelections: {} }),
      }) as any
    );
    expect(response.status).toBe(200);

    expect(mockPrisma.openSourceEntry.deleteMany).toHaveBeenCalledTimes(1);
    const deleteArgs = mockPrisma.openSourceEntry.deleteMany.mock.calls[0][0];

    expect(deleteArgs.where.userId).toBe("user-1");
    expect(deleteArgs.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          partnershipName: expect.objectContaining({ equals: "Kevin M." }),
        }),
      ])
    );
    expect(deleteArgs.where.OR).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          partnershipName: expect.objectContaining({ equals: "Completed Partner" }),
        }),
      ])
    );
  });
});
