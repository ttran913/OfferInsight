jest.mock('@/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    studentMonthlyMeeting: { delete: jest.fn() },
    instructorGoogleCalendar: { findUnique: jest.fn() },
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

import { POST } from '@/app/api/instructor/students/cancel-meeting/route';
import { deleteMonthlyMeetingEvent } from '@/app/lib/calendar/google-calendar';
import { sendEmail } from '@/app/lib/email';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import { prisma } from '@/db';

const mockSession = getInstructorSession as jest.Mock;
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockMeetingDelete = prisma.studentMonthlyMeeting.delete as jest.Mock;
const mockDeleteEvent = deleteMonthlyMeetingEvent as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

function studentWithMeeting() {
  return {
    name: 'Sam',
    email: 'sam@example.com',
    monthlyMeeting: {
      id: 'meeting-1',
      instructorId: 'coach-1',
      googleEventId: 'event-1',
      weeklyKey: '3|10:00',
      dayOfWeek: 3,
      localTime: '10:00',
      timezone: 'America/Los_Angeles',
      firstOccurrence: new Date('2026-06-10T17:00:00.000Z'),
      instructor: { displayName: 'Coach Kim' },
    },
  };
}

function request(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/instructor/students/cancel-meeting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'user-1', ...body }),
  }) as any;
}

describe('POST /api/instructor/students/cancel-meeting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ id: 'coach-1', role: 'INSTRUCTOR', displayName: 'Coach Kim' });
    mockFindUnique.mockResolvedValue(studentWithMeeting());
    (prisma.instructorGoogleCalendar.findUnique as jest.Mock).mockResolvedValue({
      googleEmail: 'coach@example.com',
    });
    mockSendEmail.mockResolvedValue(undefined);
  });

  it('lets read-only instructors cancel only their own students', async () => {
    mockSession.mockResolvedValue({ id: 'coach-2', role: 'READ_ONLY' });
    expect((await POST(request({}))).status).toBe(403);
    expect(mockMeetingDelete).not.toHaveBeenCalled();
  });

  it('refuses students without a meeting', async () => {
    mockFindUnique.mockResolvedValue({ ...studentWithMeeting(), monthlyMeeting: null });
    expect((await POST(request({}))).status).toBe(409);
  });

  it('cancels the series and emails the student and instructor, without starting a clock', async () => {
    const body = await (await POST(request({ emailStudent: true }))).json();

    expect(body).toEqual({ success: true, emailSent: true });
    expect(mockDeleteEvent).toHaveBeenCalledWith('coach-1', 'event-1');
    expect(mockMeetingDelete).toHaveBeenCalledWith({ where: { id: 'meeting-1' } });
    expect(prisma.user.update).not.toHaveBeenCalled();

    const [instructorMail] = mockSendEmail.mock.calls[0];
    expect(instructorMail.to).toBe('coach@example.com');
    expect(instructorMail.text).toContain('because you cancelled it from the instructor dashboard');

    const [studentMail] = mockSendEmail.mock.calls[1];
    expect(studentMail.to).toBe('sam@example.com');
    expect(studentMail.subject).toBe('Your monthly 1:1 with Coach Kim has been cancelled');
    expect(studentMail.text).toContain('2nd Wednesday of every month at 10:00 AM');
    expect(studentMail.attachments[0].contentType).toContain('method=CANCEL');
  });

  it('can skip the student email, e.g. for a test account', async () => {
    const body = await (await POST(request({ emailStudent: false }))).json();

    expect(body).toEqual({ success: true, emailSent: false });
    expect(mockMeetingDelete).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].to).toBe('coach@example.com');
  });
});
