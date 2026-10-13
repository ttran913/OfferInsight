jest.mock('@/db', () => ({
  prisma: {
    studentMonthlyMeeting: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/app/lib/email', () => ({
  sendEmail: jest.fn(),
}));

import { GET } from '@/app/api/cron/meeting-reminders/route';
import { prisma } from '@/db';
import { sendEmail } from '@/app/lib/email';

const mockFindMany = prisma.studentMonthlyMeeting.findMany as jest.Mock;
const mockUpdate = prisma.studentMonthlyMeeting.update as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

// 2nd Wednesday at 10:00 Pacific; next meeting Wed 2026-07-08
const JULY_8 = new Date('2026-07-08T17:00:00.000Z');

function storedMeeting() {
  return {
    id: 'meeting-1',
    dayOfWeek: 3,
    localTime: '10:00',
    timezone: 'America/Los_Angeles',
    firstOccurrence: new Date('2026-06-10T17:00:00.000Z'),
    lastReminderFor: null as Date | null,
    user: { name: 'Sam', email: 'sam@example.com' },
    instructor: { displayName: 'Coach Kim' },
    moves: [] as { originalStart: Date; newStart: Date }[],
  };
}

function cronRequest(query = '', token = 'test-cron-secret') {
  return new Request(`http://localhost:3000/api/cron/meeting-reminders${query}`, {
    headers: { authorization: `Bearer ${token}` },
  }) as any;
}

describe('GET /api/cron/meeting-reminders', () => {
  let meeting: ReturnType<typeof storedMeeting>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-07-07T16:00:00.000Z')); // 9 AM PDT the day before
    process.env.CRON_SECRET = 'test-cron-secret';
    meeting = storedMeeting();
    mockFindMany.mockImplementation(async () => [meeting]);
    mockUpdate.mockImplementation(async ({ data }) => {
      meeting.lastReminderFor = data.lastReminderFor;
      return meeting;
    });
    mockSendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a bad secret', async () => {
    const response = await GET(cronRequest('', 'wrong'));
    expect(response.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('emails the student once and records the reminded meeting', async () => {
    const body = await (await GET(cronRequest())).json();

    expect(body.sent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const mail = mockSendEmail.mock.calls[0][0];
    expect(mail.to).toBe('sam@example.com');
    expect(mail.subject).toBe('Reminder: your 1:1 with Coach Kim is tomorrow');
    expect(mail.text).toContain('Open Source Contributions board');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'meeting-1' },
      data: { lastReminderFor: JULY_8 },
    });
  });

  it('does not resend on a second run', async () => {
    await GET(cronRequest());
    const body = await (await GET(cronRequest())).json();

    expect(body.sent).toBe(0);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('only lists recipients in a dry run', async () => {
    const body = await (await GET(cronRequest('?dryRun=true'))).json();

    expect(body.dryRun).toBe(true);
    expect(body.details).toEqual([
      expect.objectContaining({ email: 'sam@example.com', occurrenceStart: JULY_8.toISOString() }),
    ]);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips a meeting moved off tomorrow', async () => {
    meeting.moves = [{ originalStart: JULY_8, newStart: new Date('2026-07-10T21:00:00.000Z') }];
    const body = await (await GET(cronRequest())).json();

    expect(body.details).toEqual([]);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not mark the meeting when the email fails', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SMTP down'));
    const body = await (await GET(cronRequest())).json();

    expect(body.failed).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
