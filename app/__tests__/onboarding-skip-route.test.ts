jest.mock('../../auth', () => ({ auth: jest.fn() }));

jest.mock('@/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));

jest.mock('@/app/lib/email', () => ({
  ...jest.requireActual('@/app/lib/email'),
  sendEmail: jest.fn(),
}));

import { POST } from '@/app/api/users/onboarding4/skip/route';
import { sendEmail } from '@/app/lib/email';
import { prisma } from '@/db';
import { auth } from '../../auth';

const mockAuth = auth as unknown as jest.Mock;
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

const NOW = new Date('2026-10-14T16:00:00.000Z');

function student(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Sam',
    email: 'sam@example.com',
    onboardingProgress: 3,
    mustBookSince: null,
    removedFromResumeBook: false,
    monthlyMeeting: null,
    ...overrides,
  };
}

describe('POST /api/users/onboarding4/skip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
    mockAuth.mockResolvedValue({ user: { email: 'sam@example.com' } });
    mockSendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requires a session', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it('finishes onboarding, starts the clock, and emails the 72-hour deadline', async () => {
    mockFindUnique.mockResolvedValue(student());
    const body = await (await POST()).json();

    expect(body).toEqual({ clockStarted: true, emailSent: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        onboardingProgress: 4,
        mustBookSince: NOW,
        mustBookReason: 'skippedOnboarding',
        bookFinalWarningSentAt: null,
      },
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].text).toContain('Saturday, October 17, 2026');
  });

  it('never restarts a running clock', async () => {
    mockFindUnique.mockResolvedValue(
      student({ onboardingProgress: 4, mustBookSince: new Date('2026-10-12T16:00:00.000Z') })
    );
    const body = await (await POST()).json();

    expect(body.clockStarted).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { onboardingProgress: 4 } });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not start a clock for booked or removed students', async () => {
    for (const overrides of [{ monthlyMeeting: { id: 'meeting-1' } }, { removedFromResumeBook: true }]) {
      mockFindUnique.mockResolvedValue(student(overrides));
      expect((await (await POST()).json()).clockStarted).toBe(false);
    }
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
