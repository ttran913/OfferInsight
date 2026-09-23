import { DAY_LABELS, MEETING_DURATION_MINUTES } from './constants';
import type { GeneratedSlot } from './slots';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Fold ICS text lines at 75 octets (simplified). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * nth weekday of month for RRULE BYDAY (1–4, or -1 for 5th/last).
 */
export function nthWeekdayForLocalDate(localDate: string): number {
  const day = Number(localDate.split('-')[2]);
  const nth = Math.ceil(day / 7);
  return nth >= 5 ? -1 : nth;
}

export function buildMonthlyByDayRrule(dayOfWeek: number, localDate: string): string {
  const nth = nthWeekdayForLocalDate(localDate);
  return `FREQ=MONTHLY;BYDAY=${nth}${BYDAY[dayOfWeek]}`;
}

export type MonthlyInviteInput = {
  slot: GeneratedSlot;
  studentName: string | null;
  studentEmail: string;
  instructorName: string;
  uid?: string;
};

export function buildMonthlyMeetingIcs(input: MonthlyInviteInput): {
  filename: string;
  content: string;
  rrule: string;
} {
  const { slot, studentName, studentEmail, instructorName } = input;
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const uid =
    input.uid ||
    `monthly-1on1-${slot.weeklyKey.replace('|', '-')}-${Buffer.from(studentEmail).toString('base64url').slice(0, 12)}@offerinsight`;
  const rrule = buildMonthlyByDayRrule(slot.dayOfWeek, slot.localDate);
  const summary = `Monthly 1:1 with ${instructorName}`;
  const description = `Standing monthly meeting (${DAY_LABELS[slot.dayOfWeek]} ${slot.localTime}, ${MEETING_DURATION_MINUTES} minutes). Reschedule anytime from your OfferInsight Account page.`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OfferInsight//Monthly 1:1//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `RRULE:${rrule}`,
    foldLine(`SUMMARY:${escapeText(summary)}`),
    foldLine(`DESCRIPTION:${escapeText(description)}`),
    foldLine(`ORGANIZER;CN=${escapeText(instructorName)}:mailto:${process.env.EMAIL_FROM || 'noreply@offerinsight.local'}`),
    foldLine(
      `ATTENDEE;CN=${escapeText(studentName || studentEmail)};RSVP=TRUE:mailto:${studentEmail}`
    ),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const dayLabel = DAY_LABELS[slot.dayOfWeek].toLowerCase();
  return {
    filename: `monthly-1on1-${dayLabel}-${slot.localTime.replace(':', '')}.ics`,
    content: lines.join('\r\n') + '\r\n',
    rrule,
  };
}

export function buildMonthlyMeetingEmail(input: {
  studentName: string | null;
  instructorName: string;
  slot: GeneratedSlot;
  isReschedule: boolean;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const day = DAY_LABELS[input.slot.dayOfWeek];
  const when = `${day}s at ${input.slot.localTime} (${input.slot.timezone.replace(/_/g, ' ')})`;
  const first = `${input.slot.localDate} at ${input.slot.localTime}`;
  const action = input.isReschedule ? 'updated' : 'scheduled';

  const subject = input.isReschedule
    ? `Updated: Monthly 1:1 with ${input.instructorName}`
    : `Monthly 1:1 with ${input.instructorName}`;

  const text = `Hi ${name},

Your monthly 1:1 with ${input.instructorName} has been ${action}.

Standing time: ${when}
First upcoming meeting: ${first}
Duration: ${MEETING_DURATION_MINUTES} minutes

A calendar invite (.ics) is attached — open it to add this series to your calendar.

You can reschedule anytime from your OfferInsight Account page.

Best,
OfferInsight`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#007ACC;">Monthly 1:1 with ${escapeHtml(input.instructorName)}</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your monthly 1:1 has been <strong>${action}</strong>.</p>
  <p><strong>Standing time:</strong> ${escapeHtml(when)}<br/>
  <strong>First upcoming meeting:</strong> ${escapeHtml(first)}<br/>
  <strong>Duration:</strong> ${MEETING_DURATION_MINUTES} minutes</p>
  <p>A calendar invite (<code>.ics</code>) is attached — open it to add this series to your calendar.</p>
  <p>You can reschedule anytime from your OfferInsight Account page.</p>
  <p>Best,<br/>OfferInsight</p>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatEndHhMm(startHhMm: string, durationMinutes: number): string {
  const [h, m] = startHhMm.split(':').map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}`;
}
