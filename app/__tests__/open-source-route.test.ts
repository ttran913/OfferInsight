jest.mock("@/db", () => ({
  prisma: {
    openSourceEntry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/app/lib/api-user-helper", () => ({
  canMutateUserDataForRequest: jest.fn(),
  getUserIdForRequest: jest.fn(),
}));

import { DELETE, GET } from "@/app/api/open_source/route";
import { prisma } from "@/db";
import {
  canMutateUserDataForRequest,
  getUserIdForRequest,
} from "@/app/lib/api-user-helper";

const mockFindMany = prisma.openSourceEntry.findMany as jest.Mock;
const mockFindFirst = prisma.openSourceEntry.findFirst as jest.Mock;
const mockDelete = prisma.openSourceEntry.delete as jest.Mock;
const mockGetUserId = getUserIdForRequest as jest.Mock;
const mockCanMutate = canMutateUserDataForRequest as jest.Mock;

describe("GET /api/open_source", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns stored open source rows for the authenticated user", async () => {
    mockGetUserId.mockResolvedValue({ userId: "user-1", error: null });
    mockFindMany.mockResolvedValue([
      { id: 11, partnershipName: "Kevin M.", status: "plan", userId: "user-1" },
      { id: 12, partnershipName: "Kevin M.", status: "done", userId: "user-1" },
    ]);

    const response = await GET(new Request("http://localhost/api/open_source") as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { dateCreated: "desc" },
      })
    );
    expect(body).toHaveLength(2);
    expect(body.map((r: any) => r.id)).toEqual([11, 12]);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUserId.mockResolvedValue({ userId: null, error: "Unauthorized" });

    const response = await GET(new Request("http://localhost/api/open_source") as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/open_source", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanMutate.mockResolvedValue({ allowed: true });
    mockGetUserId.mockResolvedValue({ userId: "user-1", error: null });
  });

  it("deletes user-managed issue cards", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      userId: "user-1",
      criteriaType: "issue",
    });
    mockDelete.mockResolvedValue({ id: 1 });

    const response = await DELETE(
      new Request("http://localhost/api/open_source?id=1") as any
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it("deletes user-managed ecosystem conversation cards", async () => {
    mockFindFirst.mockResolvedValue({
      id: 2,
      userId: "user-1",
      criteriaType: "ecosystem_conversation",
    });
    mockDelete.mockResolvedValue({ id: 2 });

    const response = await DELETE(
      new Request("http://localhost/api/open_source?id=2") as any
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it("rejects deleting non-user-managed cards", async () => {
    mockFindFirst.mockResolvedValue({
      id: 3,
      userId: "user-1",
      criteriaType: "blog_post",
    });

    const response = await DELETE(
      new Request("http://localhost/api/open_source?id=3") as any
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only user-managed cards can be deleted.");
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
