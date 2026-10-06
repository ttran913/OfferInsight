import {
  chooseDefaultInstructorId,
  chooseSchedulingInstructorId,
  instructorLabel,
} from '../lib/calendar/instructor-choice';
import { buildMonthlyMeetingCancelIcs, buildMonthlyMeetingIcs } from '../lib/calendar/ics';
import type { GeneratedSlot } from '../lib/calendar/slots';

const utsab = { id: 'utsab', isDefaultScheduler: false, hasAvailability: true };
const jasper = { id: 'jasper', isDefaultScheduler: false, hasAvailability: true };
const idle = { id: 'idle', isDefaultScheduler: false, hasAvailability: false };

describe('chooseDefaultInstructorId', () => {
  it('prefers the instructor flagged as default', () => {
    expect(chooseDefaultInstructorId([utsab, { ...jasper, isDefaultScheduler: true }])).toBe('jasper');
  });

  it('falls back to the first instructor with availability', () => {
    expect(chooseDefaultInstructorId([idle, jasper, utsab])).toBe('jasper');
  });

  it('falls back to the first instructor when nobody has availability', () => {
    expect(chooseDefaultInstructorId([idle, { ...idle, id: 'idle2' }])).toBe('idle');
  });

  it('returns null with no instructors', () => {
    expect(chooseDefaultInstructorId([])).toBeNull();
  });
});

describe('chooseSchedulingInstructorId', () => {
  const candidates = [utsab, jasper];

  it('uses the assigned instructor first', () => {
    expect(
      chooseSchedulingInstructorId({
        assignedInstructorId: 'jasper',
        meetingInstructorId: 'utsab',
        candidates,
      })
    ).toBe('jasper');
  });

  it('keeps an unassigned student with the instructor of their existing meeting', () => {
    expect(
      chooseSchedulingInstructorId({
        assignedInstructorId: null,
        meetingInstructorId: 'jasper',
        candidates,
      })
    ).toBe('jasper');
  });

  it('uses the default for unassigned students without a meeting', () => {
    expect(
      chooseSchedulingInstructorId({ assignedInstructorId: null, meetingInstructorId: null, candidates })
    ).toBe('utsab');
  });
});

describe('instructorLabel', () => {
  it('uses the display name, else the username', () => {
    expect(instructorLabel({ displayName: '  Jasper ', username: 'instructor01' })).toBe('Jasper');
    expect(instructorLabel({ displayName: null, username: 'instructor01' })).toBe('instructor01');
    expect(instructorLabel({ displayName: '   ', username: 'instructor01' })).toBe('instructor01');
  });
});

describe('buildMonthlyMeetingCancelIcs', () => {
  const slot: GeneratedSlot = {
    start: '2026-06-10T17:00:00.000Z',
    end: '2026-06-10T17:20:00.000Z',
    dayOfWeek: 3,
    localDate: '2026-06-10',
    localTime: '10:00',
    weeklyKey: '3|10:00',
    timezone: 'America/Los_Angeles',
  };
  const input = {
    slot,
    studentName: 'Ada',
    studentEmail: 'ada@example.com',
    instructorName: 'Utsab',
  };

  function field(content: string, name: string): string | undefined {
    return content
      .split('\r\n')
      .find((line) => line.startsWith(`${name}:`))
      ?.slice(name.length + 1);
  }

  it('cancels the same invite UID that the booking sent', () => {
    const request = buildMonthlyMeetingIcs(input).content;
    const cancel = buildMonthlyMeetingCancelIcs(input).content;

    expect(field(cancel, 'UID')).toBe(field(request, 'UID'));
    expect(field(cancel, 'METHOD')).toBe('CANCEL');
    expect(field(cancel, 'STATUS')).toBe('CANCELLED');
    expect(Number(field(cancel, 'SEQUENCE'))).toBeGreaterThan(Number(field(request, 'SEQUENCE')));
    expect(field(cancel, 'RRULE')).toBe(field(request, 'RRULE'));
  });
});
