jest.mock('@/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    missedMeeting: { upsert: jest.fn(), count: jest.fn(), delete: jest.fn() },
    studentMonthlyMeeting: { delete: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

jest.mock('@/app/lib/instructor-auth', () => ({
  getInstructorSession: jest.fn(),
}));

jest.mock('@/app/lib/calendar/google-calendar', () => ({
  deleteMonthlyMeetingEvent: jest.fn(),
}));

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));

jest.mock('@/app/lib/email', () => ({
  ...jest.requireActual('@/app/lib/email'),
  sendEmail: jest.fn(),
}));

import { DELETE, POST } from '@/app/api/instructor/students/missed-meeting/route';
import { deleteMonthlyMeetingEvent } from '@/app/lib/calendar/google-calendar';
import { sendEmail } from '@/app/lib/email';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import { prisma } from '@/db';

const mockSession = getInstructorSession as jest.Mock;
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockUpsert = prisma.missedMeeting.upsert as jest.Mock;
const mockMissedDelete = prisma.missedMeeting.delete as jest.Mock;
const mockMeetingDelete = prisma.studentMonthlyMeeting.delete as jest.Mock;
const mockDeleteEvent = deleteMonthlyMeetingEvent as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

const NOW = new Date('2026-07-09T16:00:00.000Z');
const JULY_8 = new Date('2026-07-08T17:00:00.000Z');

function studentWithMeeting() {
  return {
    id: 'user-1',
    name: 'Sam',
    email: 'sam@example.com',
    removedFromResumeBook: false,
    monthlyMeeting: {
      id: 'meeting-1',
      instructorId: 'coach-1',
      googleEventId: 'event-1',
      weeklyKey: '3|10:00',
      dayOfWeek: 3,
      localTime: '10:00',
      timezone: 'America/Los_Angeles',
      firstOccurrence: new Date('2026-06-10T17:00:00.000Z'),
      moves: [],
      instructor: { displayName: 'Coach Kim' },
    },
  };
}

function request(method: 'POST' | 'DELETE', body: unknown = { userId: 'user-1' }) {
  return new Request('http://localhost:3000/api/instructor/students/missed-meeting', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('/api/instructor/students/missed-meeting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
    mockSession.mockResolvedValue({ id: 'coach-1', role: 'INSTRUCTOR' });
    (prisma.missedMeeting.count as jest.Mock).mockResolvedValue(1);
    mockSendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('POST', () => {
    it('requires an instructor session', async () => {
      mockSession.mockResolvedValue(null);
      expect((await POST(request('POST'))).status).toBe(401);
    });

    it('lets read-only instructors mark only their own students', async () => {
      mockSession.mockResolvedValue({ id: 'coach-2', role: 'READ_ONLY' });
      mockFindUnique.mockResolvedValue(studentWithMeeting());

      expect((await POST(request('POST'))).status).toBe(403);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('refuses students without a meeting', async () => {
      mockFindUnique.mockResolvedValue({ ...studentWithMeeting(), monthlyMeeting: null });
      expect((await POST(request('POST'))).status).toBe(409);
    });

    it('refuses before the first meeting has happened', async () => {
      jest.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
      mockFindUnique.mockResolvedValue(studentWithMeeting());

      expect((await POST(request('POST'))).status).toBe(409);
      expect(mockMeetingDelete).not.toHaveBeenCalled();
    });

    it('records the miss, cancels the schedule, starts the clock, and emails once', async () => {
      mockFindUnique.mockResolvedValue(studentWithMeeting());
      const body = await (await POST(request('POST'))).json();

      expect(body).toEqual({
        success: true,
        missedStart: JULY_8.toISOString(),
        missedCount: 1,
        emailSent: true,
      });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { userId: 'user-1', occurrenceStart: JULY_8, markedByInstructorId: 'coach-1' },
        })
      );
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mustBookSince: NOW, mustBookReason: 'missedMeeting', bookFinalWarningSentAt: null },
      });
      expect(mockDeleteEvent).toHaveBeenCalledWith('coach-1', 'event-1');
      expect(mockMeetingDelete).toHaveBeenCalledWith({ where: { id: 'meeting-1' } });

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const mail = mockSendEmail.mock.calls[0][0];
      expect(mail.to).toBe('sam@example.com');
      expect(mail.subject).toBe('You missed your 1:1 with Coach Kim. Please book a new time');
      expect(mail.text).toContain('Sunday, July 12, 2026');
      expect(mail.attachments[0].contentType).toContain('method=CANCEL');
    });

    it('does not start a clock for a student already removed', async () => {
      mockFindUnique.mockResolvedValue({ ...studentWithMeeting(), removedFromResumeBook: true });
      await POST(request('POST'));

      expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: {} });
    });
  });

  describe('DELETE', () => {
    function markedStudent(markedBy = 'coach-1') {
      return {
        mustBookReason: 'missedMeeting',
        missedMeetings: [{ id: 'missed-1', occurrenceStart: JULY_8, markedByInstructorId: markedBy }],
      };
    }

    it('removes the mark and clears the clock without emailing', async () => {
      mockFindUnique.mockResolvedValue(markedStudent());
      (prisma.missedMeeting.count as jest.Mock).mockResolvedValue(0);
      const body = await (await DELETE(request('DELETE'))).json();

      expect(body).toEqual({ success: true, missedCount: 0 });
      expect(mockMissedDelete).toHaveBeenCalledWith({ where: { id: 'missed-1' } });
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mustBookSince: null, mustBookReason: null, bookFinalWarningSentAt: null },
      });
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('cannot undo a skipped-onboarding clock', async () => {
      mockFindUnique.mockResolvedValue({ ...markedStudent(), mustBookReason: 'skippedOnboarding' });
      expect((await DELETE(request('DELETE'))).status).toBe(409);
      expect(mockMissedDelete).not.toHaveBeenCalled();
    });

    it("lets read-only instructors undo only their own marks", async () => {
      mockSession.mockResolvedValue({ id: 'coach-2', role: 'READ_ONLY' });
      mockFindUnique.mockResolvedValue(markedStudent('coach-1'));
      expect((await DELETE(request('DELETE'))).status).toBe(403);
    });
  });
});
