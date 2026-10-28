import { appUrl, escapeHtml } from '@/app/lib/email-layout';
import { DAY_LABELS, MEETING_DURATION_MINUTES } from './constants';
import { inviteDetailsLines } from './meeting-details';
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
  /** Formatted location line, e.g. "Online: https://…"; omitted from ICS when null. */
  meetingLocation?: string | null;
  /** Preferred student-facing contact email; omitted when null. */
  contactEmail?: string | null;
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
    'PRODID:-//OpenSourceResume//Monthly 1:1//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${monthlyMeetingUid(slot, studentEmail)}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    foldLine(`SUMMARY:${escapeText(`Monthly 1:1 with ${instructorName}`)}`),
    foldLine(`ORGANIZER;CN=${escapeText(instructorName)}:mailto:${process.env.EMAIL_FROM || 'noreply@opensourceresume.local'}`),
    foldLine(
      `ATTENDEE;CN=${escapeText(studentName || studentEmail)};RSVP=TRUE:mailto:${studentEmail}`
    ),
    ...eventLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** HTML fragment for Where/Contact lines; empty string when none. */
function inviteDetailsHtml(input: {
  meetingLocation?: string | null;
  contactEmail?: string | null;
}): string {
  return inviteDetailsLines(input)
    .map((line) => {
      const [label, ...rest] = line.split(': ');
      return `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(rest.join(': '))}`;
    })
    .join('<br/>\n  ');
}

function buildMonthlyIcs(
  input: MonthlyInviteInput,
  method: IcsMethod
): { filename: string; content: string } {
  const { slot } = input;
  const cancel = method === 'CANCEL';
  const detailLines = cancel ? [] : inviteDetailsLines(input);
  const description = cancel
    ? 'This standing monthly meeting has been cancelled. Pick a new time from your OpenSourceResume Account page.'
    : [
        `Standing monthly meeting (${monthlyWhenLabel(slot)}, ${MEETING_DURATION_MINUTES} minutes).`,
        ...detailLines,
        'Reschedule anytime from your OpenSourceResume Account page.',
      ].join('\n');

  const location = !cancel && input.meetingLocation?.trim() ? input.meetingLocation.trim() : null;

  const content = buildIcsContent(method, input, [
    `DTSTART:${formatIcsUtc(new Date(slot.start))}`,
    `DTEND:${formatIcsUtc(new Date(slot.end))}`,
    `RRULE:${buildMonthlyByDayRrule(slot.dayOfWeek, slot.localDate)}`,
    ...(location ? [foldLine(`LOCATION:${escapeText(location)}`)] : []),
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
 * Moves one date of the series to `newStart` (or back to its original time after an
 * undo), matched to the original invite by UID + RECURRENCE-ID. `slot` must be the
 * series' first slot.
 */
export function buildMovedOccurrenceIcs(
  input: MonthlyInviteInput & { originalStart: string; newStart: string }
): { filename: string; content: string } {
  const original = new Date(input.originalStart);
  const start = new Date(input.newStart);
  const end = new Date(start.getTime() + MEETING_DURATION_MINUTES * 60 * 1000);
  const content = buildIcsContent('REQUEST', input, [
    `RECURRENCE-ID:${formatIcsUtc(original)}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    'STATUS:CONFIRMED',
    // Calendars keep the highest sequence, so each later change must count higher.
    `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
  ]);
  return {
    filename: `1on1-${start.toISOString().slice(0, 10)}.ics`,
    content,
  };
}

const EMAIL_WRAPPER_START = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">`;

/** To the student after they move one meeting (one time only), or undo that move. */
export function buildMeetingMoveStudentEmail(input: {
  studentName: string | null;
  instructorName: string;
  /** Regular date being moved, e.g. "Wednesday, June 10, 2026 at 10:00 AM PDT" */
  originalLabel: string;
  /** Where that one meeting now happens (unused when undone) */
  newLabel: string;
  /** e.g. "2nd Wednesday of every month at 10:00 AM PDT" */
  scheduleLabel: string;
  undone: boolean;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const subject = input.undone
    ? `Back to your regular time: 1:1 with ${input.instructorName}`
    : `Moved (one time): your 1:1 with ${input.instructorName}`;
  const lead = input.undone
    ? `Your 1:1 with ${input.instructorName} is back at its regular time: ${input.originalLabel}.`
    : `Your 1:1 with ${input.instructorName} on ${input.originalLabel} has been moved to ${input.newLabel}. This change is for that one meeting only.`;
  const schedule = `Your regular schedule hasn't changed: ${input.scheduleLabel}.`;
  const ics = 'The attached calendar file (.ics) updates that date on your calendar.';

  const text = `Hi ${name},

${lead}

${schedule}

${ics}

Best,
OpenSourceResume`;
  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">${escapeHtml(subject)}</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>${escapeHtml(lead)}</p>
  <p><strong>${escapeHtml(schedule)}</strong></p>
  <p>${escapeHtml(ics)}</p>
  <p>Best,<br/>OpenSourceResume</p>
</body></html>`;
  return { subject, text, html };
}

function instructorNoticeEmail(subject: string, paragraphs: string[]) {
  const text = [...paragraphs, 'OpenSourceResume'].join('\n\n');
  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">${escapeHtml(subject)}</h2>
  ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  <p>OpenSourceResume</p>
</body></html>`;
  return { subject, text, html };
}

/** e.g. "Wednesday, June 10, 2026 at 10:00 AM", with " PDT" when `withZone` */
function firstMeetingLabel(slot: GeneratedSlot, withZone = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: slot.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(withZone ? { timeZoneName: 'short' as const } : {}),
  }).format(new Date(slot.start));
}

/** To the instructor when a student moves one meeting (one time only), or undoes that move. */
export function buildMeetingMoveInstructorEmail(input: {
  studentName: string;
  originalLabel: string;
  newLabel: string;
  undone: boolean;
}): { subject: string; text: string; html: string } {
  const subject = input.undone
    ? `${input.studentName}'s 1:1 is back at its regular time`
    : `${input.studentName} moved one 1:1`;
  const lead = input.undone
    ? `${input.studentName} undid their one-time move. Their 1:1 is back on ${input.originalLabel}.`
    : `${input.studentName} moved their 1:1 on ${input.originalLabel} to ${input.newLabel}, one time only. Their monthly series is otherwise unchanged.`;
  return instructorNoticeEmail(subject, [lead, 'Your Google Calendar has been updated.']);
}

/** To the instructor when a student books a monthly 1:1, or changes its regular time. */
export function buildMeetingBookedInstructorEmail(input: {
  studentName: string;
  slot: GeneratedSlot;
  isReschedule: boolean;
  /** Whether the series was added to the instructor's Google Calendar */
  calendarSynced: boolean;
}): { subject: string; text: string; html: string } {
  const when = `${monthlyWhenLabel(input.slot)} (${input.slot.timezone.replace(/_/g, ' ')})`;
  const first = firstMeetingLabel(input.slot, true);

  const subject = input.isReschedule
    ? `${input.studentName} changed their monthly 1:1`
    : `New monthly 1:1: ${input.studentName}`;
  const lead = input.isReschedule
    ? `${input.studentName} moved their monthly 1:1 with you to ${when}.`
    : `${input.studentName} booked a monthly 1:1 with you: ${when}.`;
  return instructorNoticeEmail(subject, [
    lead,
    `First meeting: ${first} (${MEETING_DURATION_MINUTES} minutes).`,
    input.calendarSynced
      ? 'It has been added to your Google Calendar.'
      : "It couldn't be added to your Google Calendar. Connect or reconnect Google Calendar in the instructor dashboard so future bookings are added automatically.",
  ]);
}

/** To the instructor when a student's monthly 1:1 series is cancelled. */
export function buildMeetingCancelledInstructorEmail(input: {
  studentName: string;
  slot: GeneratedSlot;
  /** Completes "...was cancelled because ..." */
  because: string;
  /** Whether the series was removed from the instructor's Google Calendar */
  calendarUpdated: boolean;
}): { subject: string; text: string; html: string } {
  return instructorNoticeEmail(`Cancelled: ${input.studentName}'s monthly 1:1`, [
    `${input.studentName}'s monthly 1:1 (${monthlyWhenLabel(input.slot)}) was cancelled because ${input.because}.`,
    input.calendarUpdated
      ? 'It has been removed from your Google Calendar.'
      : 'If it is on your calendar, you can delete it.',
  ]);
}

export function buildMonthlyMeetingEmail(input: {
  studentName: string | null;
  instructorName: string;
  slot: GeneratedSlot;
  isReschedule: boolean;
  meetingLocation?: string | null;
  contactEmail?: string | null;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const when = `${monthlyWhenLabel(input.slot)} (${input.slot.timezone.replace(/_/g, ' ')})`;
  const first = firstMeetingLabel(input.slot);
  const action = input.isReschedule ? 'updated' : 'scheduled';
  const details = inviteDetailsLines(input);
  const textDetails = details.length ? `\n${details.join('\n')}\n` : '\n';
  const htmlDetails = inviteDetailsHtml(input);

  const subject = input.isReschedule
    ? `Updated: Monthly 1:1 with ${input.instructorName}`
    : `Monthly 1:1 with ${input.instructorName}`;

  const text = `Hi ${name},

Your monthly 1:1 with ${input.instructorName} has been ${action}.

Standing time: ${when}
First upcoming meeting: ${first}
Duration: ${MEETING_DURATION_MINUTES} minutes${textDetails}
A calendar invite (.ics) is attached — open it to add this series to your calendar.

You can reschedule anytime from your OpenSourceResume Account page.

Best,
OpenSourceResume`;

  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">Monthly 1:1 with ${escapeHtml(input.instructorName)}</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your monthly 1:1 has been <strong>${action}</strong>.</p>
  <p><strong>Standing time:</strong> ${escapeHtml(when)}<br/>
  <strong>First upcoming meeting:</strong> ${escapeHtml(first)}<br/>
  <strong>Duration:</strong> ${MEETING_DURATION_MINUTES} minutes${
    htmlDetails ? `<br/>\n  ${htmlDetails}` : ''
  }</p>
  <p>A calendar invite (<code>.ics</code>) is attached — open it to add this series to your calendar.</p>
  <p>You can reschedule anytime from your OpenSourceResume Account page.</p>
  <p>Best,<br/>OpenSourceResume</p>
</body></html>`;

  return { subject, text, html };
}

/** To the student the day before a monthly 1:1. */
export function buildMeetingReminderEmail(input: {
  studentName: string | null;
  instructorName: string;
  /** e.g. "Wednesday, June 10, 2026 at 10:00 AM PDT" */
  occurrenceLabel: string;
  meetingLocation?: string | null;
  contactEmail?: string | null;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const boardUrl = appUrl('/dashboard?tab=opensource');
  const accountUrl = appUrl('/account');
  const details = inviteDetailsLines(input);
  const textDetails = details.length ? `\n${details.join('\n')}\n` : '\n';
  const htmlDetails = inviteDetailsHtml(input);

  const subject = `Reminder: your 1:1 with ${input.instructorName} is tomorrow`;
  const when = `${input.occurrenceLabel} (${MEETING_DURATION_MINUTES} minutes)`;
  const board = `Before your 1:1, please update your Open Source Contributions board so ${input.instructorName} can see your latest progress.`;

  const text = `Hi ${name},

This is a reminder that your monthly 1:1 with ${input.instructorName} is tomorrow.

When: ${when}${textDetails}
${board}${boardUrl ? `\n${boardUrl}` : ''}

Can't make it? Reschedule from your OpenSourceResume Account page${accountUrl ? `: ${accountUrl}` : '.'}

Best,
OpenSourceResume`;

  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">Your 1:1 with ${escapeHtml(input.instructorName)} is tomorrow</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>This is a reminder that your monthly 1:1 is tomorrow.</p>
  <p><strong>When:</strong> ${escapeHtml(when)}${
    htmlDetails ? `<br/>\n  ${htmlDetails}` : ''
  }</p>
  <div style="background:#EFF6FF;border-left:4px solid #007ACC;padding:12px 16px;margin:16px 0;">
    <p style="margin:0;">${escapeHtml(board)}</p>
    <p style="margin:8px 0 0;">${linkHtml(boardUrl, 'Update my Open Source board')}</p>
  </div>
  <p>Can't make it? Reschedule from your ${linkHtml(accountUrl, 'OpenSourceResume Account page')}.</p>
  <p>Best,<br/>OpenSourceResume</p>
</body></html>`;

  return { subject, text, html };
}

export function buildInstructorChangedEmail(input: {
  studentName: string | null;
  oldInstructorName: string;
  newInstructorName: string;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const accountUrl = appUrl('/account');

  const subject = `Your monthly 1:1 is now with ${input.newInstructorName}`;

  const text = `Hi ${name},

You've been assigned a new mentor: ${input.newInstructorName}.

Your monthly 1:1 with ${input.oldInstructorName} has been cancelled. The attached calendar file (.ics) removes it from your calendar.

Please pick a new monthly time with ${input.newInstructorName} from your OpenSourceResume Account page${accountUrl ? `: ${accountUrl}` : '.'}

Best,
OpenSourceResume`;

  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">Your monthly 1:1 is now with ${escapeHtml(input.newInstructorName)}</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>You've been assigned a new mentor: <strong>${escapeHtml(input.newInstructorName)}</strong>.</p>
  <p>Your monthly 1:1 with ${escapeHtml(input.oldInstructorName)} has been cancelled. The attached calendar file (<code>.ics</code>) removes it from your calendar.</p>
  <p>Please pick a new monthly time with ${escapeHtml(input.newInstructorName)} from your ${linkHtml(accountUrl, 'OpenSourceResume Account page')}.</p>
  <p>Best,<br/>OpenSourceResume</p>
</body></html>`;

  return { subject, text, html };
}

/** To the student when an instructor cancels their monthly 1:1 series. */
export function buildMeetingCancelledEmail(input: {
  studentName: string | null;
  instructorName: string;
  slot: GeneratedSlot;
}): { subject: string; text: string; html: string } {
  const name = input.studentName || 'there';
  const accountUrl = appUrl('/account');
  const schedule = monthlyWhenLabel(input.slot);

  const subject = `Your monthly 1:1 with ${input.instructorName} has been cancelled`;

  const text = `Hi ${name},

${input.instructorName} cancelled your monthly 1:1 (${schedule}). The attached calendar file (.ics) removes it from your calendar.

Monthly 1:1s are mandatory, so please pick a new monthly time from your OpenSourceResume Account page${accountUrl ? `: ${accountUrl}` : '.'}

Best,
OpenSourceResume`;

  const html = `${EMAIL_WRAPPER_START}
  <h2 style="color:#007ACC;">${escapeHtml(subject)}</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>${escapeHtml(input.instructorName)} cancelled your monthly 1:1 (${escapeHtml(schedule)}). The attached calendar file (<code>.ics</code>) removes it from your calendar.</p>
  <p>Monthly 1:1s are <strong>mandatory</strong>, so please pick a new monthly time from your ${linkHtml(accountUrl, 'OpenSourceResume Account page')}.</p>
  <p>Best,<br/>OpenSourceResume</p>
</body></html>`;

  return { subject, text, html };
}

/** `label` is inserted as-is; without a URL it's plain text. */
function linkHtml(url: string | null, label: string): string {
  return url ? `<a href="${escapeHtml(url)}" style="color:#007ACC;">${label}</a>` : label;
}

export function formatEndHhMm(startHhMm: string, durationMinutes: number): string {
  const [h, m] = startHhMm.split(':').map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}`;
}
