jest.mock('@/db', () => ({
  prisma: {
    instructorGoogleCalendar: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../lib/calendar/google-oauth', () => ({
  createOAuth2Client: jest.fn(() => ({
    setCredentials: jest.fn(),
    on: jest.fn(),
    getAccessToken: jest.fn(async () => ({ token: 'access' })),
  })),
}));

jest.mock('../lib/calendar/token-crypto', () => ({
  decryptToken: (v: string) => v,
  encryptToken: (v: string) => v,
}));

const mockInsert = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(() => ({
      events: {
        insert: mockInsert,
        delete: jest.fn(),
      },
    })),
  },
}));

import { prisma } from '@/db';
import { syncMonthlyMeetingOnInstructorCalendar } from '../lib/calendar/google-calendar';
import type { GeneratedSlot } from '../lib/calendar/slots';

const mockFindUnique = prisma.instructorGoogleCalendar.findUnique as jest.Mock;

const slot: GeneratedSlot = {
  weeklyKey: '3|10:00',
  dayOfWeek: 3,
  localDate: '2026-06-10',
  localTime: '10:00',
  timezone: 'America/Los_Angeles',
  start: '2026-06-10T17:00:00.000Z',
  end: '2026-06-10T17:20:00.000Z',
};

describe('syncMonthlyMeetingOnInstructorCalendar location', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue({
      instructorId: 'inst-1',
      accessTokenEnc: 'access',
      refreshTokenEnc: 'refresh',
      expiryDate: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockInsert.mockResolvedValue({ data: { id: 'evt-1' } });
  });

  it('sets Google event location and contact in description when provided', async () => {
    await syncMonthlyMeetingOnInstructorCalendar({
      instructorId: 'inst-1',
      previousEventId: null,
      slot,
      studentName: 'Sam',
      studentEmail: 'sam@example.com',
      meetingLocation: 'Online: https://meet.example/x',
      contactEmail: 'coach@school.edu',
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const body = mockInsert.mock.calls[0][0].requestBody;
    expect(body.location).toBe('Online: https://meet.example/x');
    expect(body.description).toContain('Where: Online: https://meet.example/x');
    expect(body.description).toContain('Contact: coach@school.edu');
  });

  it('omits location when unset', async () => {
    await syncMonthlyMeetingOnInstructorCalendar({
      instructorId: 'inst-1',
      previousEventId: null,
      slot,
      studentName: 'Sam',
      studentEmail: 'sam@example.com',
    });

    const body = mockInsert.mock.calls[0][0].requestBody;
    expect(body.location).toBeUndefined();
    expect(body.description).not.toContain('Where:');
    expect(body.description).not.toContain('Contact:');
  });
});
