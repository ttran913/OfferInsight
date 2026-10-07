import { DAY_LABELS, MEETING_DURATION_MINUTES } from './constants';
import { formatTime12, nthOrdinalLabel } from './labels';
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
};

/** Stable invite UID for a student's standing time; reused to cancel that invite. */
export function monthlyMeetingUid(
  slot: Pick<GeneratedSlot, 'weeklyKey' | 'localDate'>,
  studentEmail: string
): string {
  const nth = nthWeekdayForLocalDate(slot.localDate);
  const week = nth === -1 ? 'last' : String(nth);
  return `monthly-1on1-${week}-${slot.weeklyKey.replace('|', '-')}-${Buffer.from(studentEmail).toString('base64url').slice(0, 12)}@offerinsight`;
}

/** e.g. "2nd Wednesday of every month at 10:00 AM" */
function monthlyWhenLabel(slot: GeneratedSlot): string {
  const nth = nthOrdinalLabel(nthWeekdayForLocalDate(slot.localDate));
  return `${nth} ${DAY_LABELS[slot.dayOfWeek]} of every month at ${formatTime12(slot.localTime)}`;
}

type IcsMethod = 'REQUEST' | 'CANCEL';

/** One-event calendar; `eventLines` go inside the VEVENT after the shared UID/summary/people lines. */
function buildIcsContent(
  method: IcsMethod,
  input: MonthlyInviteInput,
  eventLines: string[]
): string {
  const { slot, studentName, studentEmail, instructorName } = input;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OfferInsight//Monthly 1:1//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${monthlyMeetingUid(slot, studentEmail)}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    foldLine(`SUMMARY:${escapeText(`Monthly 1:1 with ${instructorName}`)}`),
    foldLine(`ORGANIZER;CN=${escapeText(instructorName)}:mailto:${process.env.EMAIL_FROM || 'noreply@offerinsight.local'}`),
    foldLine(
      `ATTENDEE;CN=${escapeText(studentName || studentEmail)};RSVP=TRUE:mailto:${studentEmail}`
    ),
    ...eventLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

function buildMonthlyIcs(
  input: MonthlyInviteInput,
  method: IcsMethod
): { filename: string; content: string } {
  const { slot } = input;
  const cancel = method === 'CANCEL';
  const description = cancel
    ? 'This standing monthly meeting has been cancelled. Pick a new time from your OfferInsight Account page.'
    : `Standing monthly meeting (${monthlyWhenLabel(slot)}, ${MEETING_DURATION_MINUTES} minutes). Reschedule anytime from your OfferInsight Account page.`;

  const content = buildIcsContent(method, input, [
    `DTSTART:${formatIcsUtc(new Date(slot.start))}`,
    `DTEND:${formatIcsUtc(new Date(slot.end))}`,
    `RRULE:${buildMonthlyByDayRrule(slot.dayOfWeek, slot.localDate)}`,
    foldLine(`DESCRIPTION:${escapeText(description)}`),
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${cancel ? 1 : 0}`,
  ]);

  const dayLabel = DAY_LABELS[slot.dayOfWeek].toLowerCase();
  const prefix = cancel ? 'cancel-monthly-1on1' : 'monthly-1on1';
  return {
    filename: `${prefix}-${dayLabel}-${slot.localTime.replace(':', '')}.ics`,
    content,
  };
}

export function buildMonthlyMeetingIcs(input: MonthlyInviteInput) {
  return buildMonthlyIcs(input, 'REQUEST');
}

/** Cancels the invite previously sent for the same standing time (same UID). */
export function buildMonthlyMeetingCancelIcs(input: MonthlyInviteInput) {
  return buildMonthlyIcs(input, 'CANCEL');
}

/**
 * Cancels one date of the series (or restores it after an undo), matched to the
 * original invite by UID + RECURRENCE-ID. `slot` must be the series' first slot.
 */
export function buildMonthlyOccurrenceIcs(
  input: MonthlyInviteInput & { occurrenceStart: string; cancelled: boolean }
): { filename: string; content: string } {
  const { cancelled } = input;
  const start = new Date(input.occurrenceStart);
  const end = new Date(start.getTime() + MEETING_DURATION_MINUTES * 60 * 1000);
  const content = buildIcsContent(cancelled ? 'CANCEL' : 'REQUEST', input, [
    `RECURRENCE-ID:${formatIcsUtc(start)}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${cancelled ? 1 : 2}`,
  ]);
  return {
    filename: `${cancelled ? 'skip' : 'restore'}-1on1-${start.toISOString().slice(0, 10)}.ics`,
    content,
  };
}

const EMAIL_WRAPPER_START = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">`;

/** To the student after they skip one meeting, or undo that skip. */
export function buildMeetingSkipStudentEmail(input: {
  studentName: string | null;
  instructorName: string;
  /** e.g. "Wednesday, June 10, 2026 at 10:00 AM PDT" */
  occurrenceLabel: string;
  nextLabel: string | null;
  undone: boolean;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const subject = input.undone
    ? `Back on: your 1:1 with ${input.instructorName}`
    : `Skipped: your 1:1 with ${input.instructorName}`;
  const lead = input.undone
    ? `Your 1:1 with ${input.instructorName} on ${input.occurrenceLabel} is back on.`
    : `You've skipped your 1:1 with ${input.instructorName} on ${input.occurrenceLabel}. Your monthly schedule stays the same.`;
  const next = !input.undone && input.nextLabel ? `Next meeting: ${input.nextLabel}` : '';
  const ics = input.undone
    ? 'The attached calendar file (.ics) puts it back on your calendar.'
    : 'The attached calendar file (.ics) removes just that date from your calendar.';

  const text = `Hi ${name},

${lead}
${next ? `\n${next}\n` : ''}
${ics}

Best,
OfferInsight`;
  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">${escapeHtml(subject)}</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>${escapeHtml(lead)}</p>
  ${next ? `<p><strong>${escapeHtml(next)}</strong></p>` : ''}
  <p>${escapeHtml(ics)}</p>
  <p>Best,<br/>OfferInsight</p>
</body></html>`;
  return { subject, text, html };
}

/** To the instructor when a student skips one meeting, or undoes that skip. */
export function buildMeetingSkipInstructorEmail(input: {
  studentName: string;
  occurrenceLabel: string;
  reason: string | null;
  undone: boolean;
}): { subject: string; text: string; html: string } {
  const subject = input.undone
    ? `${input.studentName} will make their 1:1 after all`
    : `${input.studentName} can't make their 1:1`;
  const lead = input.undone
    ? `${input.studentName} undid their skip. Their 1:1 on ${input.occurrenceLabel} is back on your calendar.`
    : `${input.studentName} can't make their 1:1 on ${input.occurrenceLabel}. It has been removed from your calendar; the rest of their monthly series is unchanged.`;
  const reason = !input.undone && input.reason ? `Reason: ${input.reason}` : '';

  const text = [lead, reason, '', 'OfferInsight'].filter(Boolean).join('\n\n');
  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">${escapeHtml(subject)}</h2>
  <p>${escapeHtml(lead)}</p>
  ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(input.reason!)}</p>` : ''}
  <p>OfferInsight</p>
</body></html>`;
  return { subject, text, html };
}

export function buildMonthlyMeetingEmail(input: {
  studentName: string | null;
  instructorName: string;
  slot: GeneratedSlot;
  isReschedule: boolean;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const when = `${monthlyWhenLabel(input.slot)} (${input.slot.timezone.replace(/_/g, ' ')})`;
  const first = new Intl.DateTimeFormat('en-US', {
    timeZone: input.slot.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(input.slot.start));
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

  const html = `${EMAIL_WRAPPER_START}
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

export function buildInstructorChangedEmail(input: {
  studentName: string | null;
  oldInstructorName: string;
  newInstructorName: string;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
  const accountUrl = baseUrl ? `${baseUrl}/account` : null;

  const subject = `Your monthly 1:1 is now with ${input.newInstructorName}`;

  const text = `Hi ${name},

You've been assigned a new mentor: ${input.newInstructorName}.

Your monthly 1:1 with ${input.oldInstructorName} has been cancelled. The attached calendar file (.ics) removes it from your calendar.

Please pick a new monthly time with ${input.newInstructorName} from your OfferInsight Account page${accountUrl ? `: ${accountUrl}` : '.'}

Best,
OfferInsight`;

  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">Your monthly 1:1 is now with ${escapeHtml(input.newInstructorName)}</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>You've been assigned a new mentor: <strong>${escapeHtml(input.newInstructorName)}</strong>.</p>
  <p>Your monthly 1:1 with ${escapeHtml(input.oldInstructorName)} has been cancelled. The attached calendar file (<code>.ics</code>) removes it from your calendar.</p>
  <p>Please pick a new monthly time with ${escapeHtml(input.newInstructorName)} from your ${
    accountUrl
      ? `<a href="${escapeHtml(accountUrl)}" style="color:#007ACC;">OfferInsight Account page</a>`
      : 'OfferInsight Account page'
  }.</p>
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
