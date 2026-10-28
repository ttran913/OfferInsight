import {
  buildMonthlyMeetingEmail,
  buildMonthlyMeetingIcs,
  buildMeetingReminderEmail,
} from '../lib/calendar/ics';
import {
  formatMeetingLocation,
  meetingDetailsPayload,
  parseMeetingDetailsPatch,
} from '../lib/calendar/meeting-details';
import type { GeneratedSlot } from '../lib/calendar/slots';

const slot: GeneratedSlot = {
  weeklyKey: '3|10:00',
  dayOfWeek: 3,
  localDate: '2026-06-10',
  localTime: '10:00',
  timezone: 'America/Los_Angeles',
  start: '2026-06-10T17:00:00.000Z',
  end: '2026-06-10T17:20:00.000Z',
};

describe('formatMeetingLocation', () => {
  it('returns null for empty values', () => {
    expect(formatMeetingLocation('ONLINE', null)).toBeNull();
    expect(formatMeetingLocation('ONLINE', '  ')).toBeNull();
  });

  it('prefixes by type', () => {
    expect(formatMeetingLocation('ONLINE', 'https://meet.example/x')).toBe(
      'Online: https://meet.example/x'
    );
    expect(formatMeetingLocation('PHONE', '+1 555')).toBe('Phone: +1 555');
    expect(formatMeetingLocation('IN_PERSON', 'Room 3')).toBe('In person: Room 3');
  });
});

describe('meetingDetailsPayload', () => {
  it('formats live instructor fields', () => {
    expect(
      meetingDetailsPayload({
        meetingLocationType: 'ONLINE',
        meetingLocation: 'https://zoom.us/j/1',
        contactEmail: ' coach@school.edu ',
      })
    ).toEqual({
      location: 'Online: https://zoom.us/j/1',
      contactEmail: 'coach@school.edu',
    });
  });

  it('omits empty fields', () => {
    expect(
      meetingDetailsPayload({
        meetingLocationType: 'ONLINE',
        meetingLocation: null,
        contactEmail: null,
      })
    ).toEqual({ location: null, contactEmail: null });
  });
});

describe('parseMeetingDetailsPatch', () => {
  it('accepts valid fields and clears empties to null', () => {
    const parsed = parseMeetingDetailsPatch({
      meetingLocationType: 'PHONE',
      meetingLocation: '  ',
      contactEmail: '  ',
    });
    expect(parsed).toEqual({
      ok: true,
      data: {
        meetingLocationType: 'PHONE',
        meetingLocation: null,
        contactEmail: null,
      },
    });
  });

  it('rejects bad type, email, and overlong location', () => {
    expect(parseMeetingDetailsPatch({ meetingLocationType: 'ZOOM' })).toEqual({
      ok: false,
      error: 'meetingLocationType must be ONLINE, PHONE, or IN_PERSON',
    });
    expect(parseMeetingDetailsPatch({ contactEmail: 'not-an-email' })).toEqual({
      ok: false,
      error: 'contactEmail must be a valid email address',
    });
    expect(parseMeetingDetailsPatch({ meetingLocation: 'x'.repeat(501) }).ok).toBe(false);
  });
});

describe('ICS and emails with meeting details', () => {
  const invite = {
    slot,
    studentName: 'Sam',
    studentEmail: 'sam@example.com',
    instructorName: 'Coach Kim',
    meetingLocation: 'Online: https://meet.example/x',
    contactEmail: 'coach@school.edu',
  };

  it('adds LOCATION and contact to the booking .ics', () => {
    const content = buildMonthlyMeetingIcs(invite).content;
    const unfolded = content.replace(/\r\n /g, '');
    expect(unfolded).toContain('LOCATION:Online: https://meet.example/x');
    expect(unfolded).toContain('Where: Online: https://meet.example/x');
    expect(unfolded).toContain('Contact: coach@school.edu');
  });

  it('omits LOCATION when unset', () => {
    const content = buildMonthlyMeetingIcs({
      ...invite,
      meetingLocation: null,
      contactEmail: null,
    }).content;
    expect(content).not.toContain('LOCATION:');
    expect(content).not.toContain('Contact:');
  });

  it('includes details in book and reminder emails', () => {
    const book = buildMonthlyMeetingEmail({
      studentName: 'Sam',
      instructorName: 'Coach Kim',
      slot,
      isReschedule: false,
      meetingLocation: invite.meetingLocation,
      contactEmail: invite.contactEmail,
    });
    expect(book.text).toContain('Where: Online: https://meet.example/x');
    expect(book.text).toContain('Contact: coach@school.edu');
    expect(book.html).toContain('Where');
    expect(book.html).toContain('coach@school.edu');

    const reminder = buildMeetingReminderEmail({
      studentName: 'Sam',
      instructorName: 'Coach Kim',
      occurrenceLabel: 'Wednesday, July 8, 2026 at 10:00 AM PDT',
      meetingLocation: invite.meetingLocation,
      contactEmail: invite.contactEmail,
    });
    expect(reminder.text).toContain('Where: Online: https://meet.example/x');
    expect(reminder.text).toContain('Contact: coach@school.edu');
  });
});
