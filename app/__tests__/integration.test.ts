/**
 * Integration tests for homepage and onboarding flow.
 *
 * Strategy: call Next.js App Router route handlers directly with a real Request
 * object. Auth and Prisma are mocked — no running server or database needed.
 * Run with: npm test
 */

// ─── Module-level mocks (Jest hoists these before any imports) ────────────────

// Prevent NextAuth(...) from running real initialization at module load time
jest.mock('next-auth', () =>
  jest.fn(() => ({
    handlers: { GET: jest.fn(), POST: jest.fn() },
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  }))
);

// Prevent PrismaAdapter(prisma) from failing when prisma is a mock
jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));

// Mock @/db — prevents real DB/pg connection
jest.mock('../../db', () => ({
  prisma: {
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

// Controls auth() return value for onboarding1 & onboarding3
// Both 'auth' (via moduleNameMapper) and '@/auth' resolve to auth.ts — one mock covers both
jest.mock('../../auth', () => ({ auth: jest.fn() }));

// Controls getUserIdForRequest() for onboarding2
jest.mock('../../app/lib/api-user-helper', () => ({
  getUserIdForRequest: jest.fn(),
}));

// Prevent redirect() from throwing in Next.js navigation
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { POST as onboarding1POST } from '../../app/api/users/onboarding1/route';
import { POST as onboarding2POST } from '../../app/api/users/onboarding2/route';
import { POST as onboarding3POST } from '../../app/api/users/onboarding3/route';
import { auth } from '../../auth';
import { prisma } from '../../db';
import { getUserIdForRequest } from '../../app/lib/api-user-helper';
import Page from '../../app/page';

// Use jest.Mock here: MockedFunction<typeof auth | prisma.user.update> often infers `never` for
// mockResolvedValue / mockRejectedValue because NextAuth and Prisma client types are not plain Promises.
const mockAuth = auth as jest.Mock;
const mockPrismaUpdate = prisma.user.update as jest.Mock;
const mockGetUserId = getUserIdForRequest as jest.Mock;

// ─── Shared test data ─────────────────────────────────────────────────────────

const mockUser = {
  id: 'cltest123456789',
  name: 'Test User',
  email: 'test@example.com',
  image: null,
  emailVerified: null,
  onboardingProgress: 0,
  school: null,
  major: null,
  expectedGraduationDate: null,
  targetOfferDate: null,
  projectedOfferDate: null,
  monthsToSecureInternship: null,
  commitment: null,
  appsWithOutreachPerWeek: null,
  networkingPerMonth: null,
  resetStartDate: new Date('2024-01-01'),
};

const mockSession = {
  user: {
    id: 'cltest123456789',
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: null,
    image: null,
    onboardingProgress: 0,
    targetOfferDate: null,
    appsWithOutreachPerWeek: null,
    networkingPerMonth: null,
    resetStartDate: new Date('2024-01-01'),
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockPrismaUpdate.mockResolvedValue(mockUser as any);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Homepage', () => {
  it('exports a default React component', () => {
    expect(typeof Page).toBe('function');
  });
});

describe('POST /api/users/onboarding1', () => {
  const validBody = {
    name: 'Alice Smith',
    school: 'State University',
    major: 'Computer Science',
    expectedGraduationDate: '2025-05-15',
  };

  function makeRequest(body: object): Request {
    return new Request('http://localhost/api/users/onboarding1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await onboarding1POST(makeRequest(validBody));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Not authenticated');
  });

  it('returns 200 and saves correct fields when authenticated', async () => {
    mockAuth.mockResolvedValue(mockSession as any);
    mockPrismaUpdate.mockResolvedValue({ ...mockUser, onboardingProgress: 1 } as any);

    const response = await onboarding1POST(makeRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockPrismaUpdate).toHaveBeenCalledTimes(1);
    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      data: {
        name: 'Alice Smith',
        school: 'State University',
        major: 'Computer Science',
        expectedGraduationDate: new Date('2025-05-15'),
        onboardingProgress: 1,
      },
    });
    const body = await response.json();
    expect(body.onboardingProgress).toBe(1);
  });

  it('returns 500 when the database call fails', async () => {
    mockAuth.mockResolvedValue(mockSession as any);
    mockPrismaUpdate.mockRejectedValue(new Error('DB connection failed'));

    const response = await onboarding1POST(makeRequest(validBody));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to update user information.');
  });
});

describe('POST /api/users/onboarding2', () => {
  const validBody = {
    monthsToSecureInternship: 6,
    commitment: 10,
    appsWithOutreachPerWeek: 5,
    networkingPerMonth: 6,
  };

  function makeRequest(body: object): Request {
    return new Request('http://localhost/api/users/onboarding2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when unauthenticated', async () => {
    mockGetUserId.mockResolvedValue({ userId: null, error: 'Unauthorized' });

    const response = await onboarding2POST(makeRequest(validBody) as any);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 200 and saves correct fields when authenticated', async () => {
    mockGetUserId.mockResolvedValue({ userId: 'cltest123456789', error: null });
    mockPrismaUpdate.mockResolvedValue({ ...mockUser, onboardingProgress: 2 } as any);

    const response = await onboarding2POST(makeRequest(validBody) as any);

    expect(response.status).toBe(200);
    expect(mockPrismaUpdate).toHaveBeenCalledTimes(1);
    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { id: 'cltest123456789' },
      data: {
        monthsToSecureInternship: 6,
        commitment: 10,
        appsWithOutreachPerWeek: 5,
        networkingPerMonth: 6,
        onboardingProgress: 2,
      },
    });
    const body = await response.json();
    expect(body.onboardingProgress).toBe(2);
  });
});

describe('POST /api/users/onboarding3', () => {
  const validBody = {
    commitment: 10,
    appsWithOutreachPerWeek: 5,
    networkingPerMonth: 6,
    targetOfferDate: '2025-08-01',
    resetStartDate: '2024-01-01',
  };

  function makeRequest(body: object): Request {
    return new Request('http://localhost/api/users/onboarding3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await onboarding3POST(makeRequest(validBody));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Not authenticated');
  });

  it('returns 200 and saves correct fields when authenticated', async () => {
    mockAuth.mockResolvedValue(mockSession as any);
    mockPrismaUpdate.mockResolvedValue({ ...mockUser, onboardingProgress: 3 } as any);

    const response = await onboarding3POST(makeRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockPrismaUpdate).toHaveBeenCalledTimes(1);
    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      data: {
        commitment: 10,
        appsWithOutreachPerWeek: 5,
        networkingPerMonth: 6,
        targetOfferDate: new Date('2025-08-01'),
        resetStartDate: new Date('2024-01-01'),
        onboardingProgress: 3,
      },
    });
    const body = await response.json();
    expect(body.onboardingProgress).toBe(3);
  });

  it('returns 500 when the database call fails', async () => {
    mockAuth.mockResolvedValue(mockSession as any);
    mockPrismaUpdate.mockRejectedValue(new Error('DB connection failed'));

    const response = await onboarding3POST(makeRequest(validBody));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to update user plan.');
  });
});
