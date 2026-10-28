import { google, calendar_v3 } from 'googleapis';
import { prisma } from '@/db';
import { DAY_LABELS, MEETING_DURATION_MINUTES } from './constants';
import { createOAuth2Client } from './google-oauth';
import { buildMonthlyByDayRrule, formatEndHhMm } from './ics';
import { inviteDetailsLines } from './meeting-details';
import type { GeneratedSlot } from './slots';
import { decryptToken, encryptToken } from './token-crypto';

async function persistRefreshedTokens(
  instructorId: string,
  tokens: { access_token?: string | null; expiry_date?: number | null; refresh_token?: string | null }
) {
  if (!tokens.access_token) return;
  await prisma.instructorGoogleCalendar.update({
    where: { instructorId },
    data: {
      accessTokenEnc: encryptToken(tokens.access_token),
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      ...(tokens.refresh_token
        ? { refreshTokenEnc: encryptToken(tokens.refresh_token) }
        : {}),
    },
  });
}

/** Authenticated Calendar API client for an instructor, or null if not connected. */
export async function getCalendarClientForInstructor(
  instructorId: string
): Promise<calendar_v3.Calendar | null> {
  const row = await prisma.instructorGoogleCalendar.findUnique({
    where: { instructorId },
  });
  if (!row) return null;

  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({
    access_token: decryptToken(row.accessTokenEnc),
    refresh_token: decryptToken(row.refreshTokenEnc),
    expiry_date: row.expiryDate?.getTime() ?? undefined,
  });

  oauth2.on('tokens', (tokens) => {
    void persistRefreshedTokens(instructorId, tokens).catch((err) =>
      console.error('Failed to persist refreshed Google tokens:', err)
    );
  });

  // Force refresh when expired / near expiry
  if (!row.expiryDate || row.expiryDate.getTime() < Date.now() + 60_000) {
    const access = await oauth2.getAccessToken();
    if (access?.token && access.token !== decryptToken(row.accessTokenEnc)) {
      await persistRefreshedTokens(instructorId, {
        access_token: access.token,
        expiry_date: oauth2.credentials.expiry_date,
      });
    }
  }

  return google.calendar({ version: 'v3', auth: oauth2 });
}

/**
 * All non-cancelled events on the instructor's primary calendar in [timeMin, timeMax),
 * with recurring series expanded into single instances. Null if Google is not connected.
 */
export async function listPrimaryCalendarEvents(
  instructorId: string,
  timeMin: Date,
  timeMax: Date
): Promise<calendar_v3.Schema$Event[] | null> {
  const calendar = await getCalendarClientForInstructor(instructorId);
  if (!calendar) return null;

  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });
    for (const event of res.data.items ?? []) {
      if (event.status !== 'cancelled') events.push(event);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

function localDateTime(slot: GeneratedSlot, hhmm: string): string {
  return `${slot.localDate}T${hhmm}:00`;
}

/**
 * Remove a monthly 1:1 series from an instructor's primary calendar. No-op if that
 * instructor is not connected; already-deleted events are ignored and other
 * failures are logged rather than thrown.
 */
export async function deleteMonthlyMeetingEvent(
  instructorId: string,
  eventId: string
): Promise<void> {
  const calendar = await getCalendarClientForInstructor(instructorId);
  if (!calendar) return;
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'none',
    });
  } catch (err: unknown) {
    const status =
      (err as { code?: number | string; response?: { status?: number } })?.response
        ?.status ?? Number((err as { code?: number | string })?.code);
    if (status !== 404 && status !== 410) {
      console.warn('Failed to delete Google Calendar event:', err);
    }
  }
}

/**
 * Move one occurrence of a monthly 1:1 series on the instructor's calendar to
 * `newStart` (pass the original start to put it back), leaving the rest of the
 * series alone. No-op if the instructor is not connected; throws if Google can't
 * find or update that occurrence.
 */
export async function moveMonthlyMeetingOccurrence(
  instructorId: string,
  eventId: string,
  originalStart: Date,
  newStart: Date
): Promise<void> {
  const calendar = await getCalendarClientForInstructor(instructorId);
  if (!calendar) return;

  // A moved instance's current time differs from its slot in the series, so look it up by original start.
  const res = await calendar.events.instances({
    calendarId: 'primary',
    eventId,
    originalStart: originalStart.toISOString(),
    showDeleted: true,
    maxResults: 5,
  });
  const instance = res.data.items?.find(
    (i) => Date.parse(i.originalStartTime?.dateTime ?? '') === originalStart.getTime()
  );
  if (!instance?.id) {
    throw new Error('That meeting was not found on the instructor’s Google Calendar');
  }

  const end = new Date(newStart.getTime() + MEETING_DURATION_MINUTES * 60 * 1000);
  await calendar.events.patch({
    calendarId: 'primary',
    eventId: instance.id,
    sendUpdates: 'none',
    requestBody: {
      status: 'confirmed',
      start: { dateTime: newStart.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });
}

export type SyncMonthlyMeetingParams = {
  instructorId: string;
  previousEventId: string | null;
  /** Calendar that holds previousEventId, when it differs from instructorId. */
  previousInstructorId?: string | null;
  slot: GeneratedSlot;
  studentName: string | null;
  studentEmail: string;
  /** Formatted location for the Google event, e.g. "Online: https://…". */
  meetingLocation?: string | null;
  contactEmail?: string | null;
};

/**
 * Delete the previous Google event (from whichever instructor's calendar holds it)
 * and create a new monthly series on the target instructor's primary calendar.
 * Returns the new event id, or null if the target instructor is not connected.
 */
export async function syncMonthlyMeetingOnInstructorCalendar(
  params: SyncMonthlyMeetingParams
): Promise<string | null> {
  if (params.previousEventId) {
    await deleteMonthlyMeetingEvent(
      params.previousInstructorId ?? params.instructorId,
      params.previousEventId
    );
  }

  const calendar = await getCalendarClientForInstructor(params.instructorId);
  if (!calendar) return null;

  const studentLabel = params.studentName || params.studentEmail;
  const endLocal = formatEndHhMm(params.slot.localTime, MEETING_DURATION_MINUTES);
  const rrule = buildMonthlyByDayRrule(params.slot.dayOfWeek, params.slot.localDate);
  const location = params.meetingLocation?.trim() || undefined;

  const created = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'none', // student already gets .ics from OpenSourceResume
    requestBody: {
      summary: `1:1 — ${studentLabel}`,
      description: [
        `OpenSourceResume monthly 1:1 with ${studentLabel}.`,
        `Standing time: ${DAY_LABELS[params.slot.dayOfWeek]}s at ${params.slot.localTime} (${params.slot.timezone}).`,
        `Duration: ${MEETING_DURATION_MINUTES} minutes.`,
        ...inviteDetailsLines(params),
        'Student can reschedule from their Account page.',
      ].join('\n'),
      ...(location ? { location } : {}),
      start: {
        dateTime: localDateTime(params.slot, params.slot.localTime),
        timeZone: params.slot.timezone,
      },
      end: {
        dateTime: localDateTime(params.slot, endLocal),
        timeZone: params.slot.timezone,
      },
      recurrence: [`RRULE:${rrule}`],
      attendees: [
        {
          email: params.studentEmail,
          displayName: params.studentName || undefined,
        },
      ],
    },
  });

  const eventId = created.data.id;
  if (!eventId) {
    throw new Error('Google Calendar did not return an event id');
  }
  return eventId;
}
