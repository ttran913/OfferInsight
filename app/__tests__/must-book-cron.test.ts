jest.mock('@/db', () => ({
  prisma: {
    user: { findMany: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('@/app/lib/calendar/scheduling-instructor', () => ({
  getInstructorDisplayName: (instructor: { displayName: string | null } | null) =>
    instructor?.displayName ?? 'your instructor',
  resolveSchedulingInstructorForUser: jest.fn(async () => ({ displayName: 'Coach Kim' })),
}));

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));

jest.mock('@/app/lib/email', () => ({
  ...jest.requireActual('@/app/lib/email'),
  sendEmail: jest.fn(),
}));

import { GET } from '@/app/api/cron/must-book/route';
import { sendEmail } from '@/app/lib/email';
import { prisma } from '@/db';

const mockFindMany = prisma.user.findMany as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-07-12T16:30:00.000Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

type ClockUser = {
  id: string;
  name: string;
  email: string;
  mustBookSince: Date;
  mustBookReason: string;
  bookFinalWarningSentAt: Date | null;
  monthlyMeeting: { id: string } | null;
  missedMeetings: { occurrenceStart: Date }[];
};

function onClock(overrides: Partial<ClockUser> = {}): ClockUser {
  return {
    id: 'user-1',
    name: 'Sam',
    email: 'sam@example.com',
    mustBookSince: hoursAgo(72),
    mustBookReason: 'missedMeeting',
    bookFinalWarningSentAt: null,
    monthlyMeeting: null,
    missedMeetings: [{ occurrenceStart: new Date('2026-07-08T17:00:00.000Z') }],
    ...overrides,
  };
}

function cronRequest(query = '', token = 'test-cron-secret') {
  return new Request(`http://localhost:3000/api/cron/must-book${query}`, {
    headers: { authorization: `Bearer ${token}` },
  }) as any;
}

describe('GET /api/cron/must-book', () => {
  let users: ClockUser[];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
    process.env.CRON_SECRET = 'test-cron-secret';
    users = [onClock()];
    mockFindMany.mockImplementation(async () => users.filter((u) => u.mustBookSince));
    mockUpdate.mockImplementation(async ({ where, data }) => {
      const user = users.find((u) => u.id === where.id)!;
      Object.assign(user, data);
      return user;
    });
    mockSendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a bad secret', async () => {
    expect((await GET(cronRequest('', 'wrong'))).status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('leaves students alone before 72 hours', async () => {
    users = [onClock({ mustBookSince: hoursAgo(71) })];
    const body = await (await GET(cronRequest())).json();

    expect(body.details).toEqual([]);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends the final warning once at 72 hours, naming the missed meeting', async () => {
    const body = await (await GET(cronRequest())).json();

    expect(body.summary.finalWarnings).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const mail = mockSendEmail.mock.calls[0][0];
    expect(mail.subject).toBe('[Resume Book] Final warning: book your 1:1 within 24 hours');
    expect(mail.text).toContain('Coach Kim');
    expect(mail.text).toContain('Wednesday, July 8, 2026');
    expect(mail.text).toContain('Monday, July 13, 2026 at 9:30 AM PDT');
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { bookFinalWarningSentAt: NOW } });

    await GET(cronRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('words the final warning for a skipped booking', async () => {
    users = [onClock({ mustBookReason: 'skippedOnboarding', missedMeetings: [] })];
    await GET(cronRequest());

    const mail = mockSendEmail.mock.calls[0][0];
    expect(mail.text).not.toContain('missed');
    expect(mail.text).not.toContain('Coach Kim');
  });

  it('removes only after the final warning', async () => {
    users = [onClock({ mustBookSince: hoursAgo(120) })];
    await GET(cronRequest());
    expect(users[0].bookFinalWarningSentAt).toEqual(NOW);

    jest.setSystemTime(new Date(NOW.getTime() + 24 * HOUR));
    const body = await (await GET(cronRequest())).json();

    expect(body.summary.removals).toBe(1);
    const mail = mockSendEmail.mock.calls[1][0];
    expect(mail.subject).toBe('[Resume Book] You Have Been Removed from the Resume Book');
    expect(mail.text).toContain('monthly 1:1');
    expect(users[0]).toMatchObject({
      removedFromResumeBook: true,
      mustBookSince: null,
      mustBookReason: null,
      bookFinalWarningSentAt: null,
    });
  });

  it('clears the clock of students who booked, without emailing', async () => {
    users = [onClock({ mustBookSince: hoursAgo(100), monthlyMeeting: { id: 'meeting-1' } })];
    const body = await (await GET(cronRequest())).json();

    expect(body.summary.cleared).toBe(1);
    expect(users[0].mustBookSince).toBeNull();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('only lists students in a dry run', async () => {
    const body = await (await GET(cronRequest('?dryRun=true'))).json();

    expect(body.dryRun).toBe(true);
    expect(body.details).toEqual([expect.objectContaining({ email: 'sam@example.com', action: 'finalWarning' })]);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not record the warning when the email fails', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP down'));
    const body = await (await GET(cronRequest())).json();

    expect(body.failed).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
