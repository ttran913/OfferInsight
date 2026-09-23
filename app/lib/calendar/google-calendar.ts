import { google, calendar_v3 } from 'googleapis';
import { prisma } from '@/db';
import { DAY_LABELS, MEETING_DURATION_MINUTES } from './constants';
import { createOAuth2Client } from './google-oauth';
import { buildMonthlyByDayRrule, formatEndHhMm } from './ics';
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

function localDateTime(slot: GeneratedSlot, hhmm: string): string {
  return `${slot.localDate}T${hhmm}:00`;
}

export type SyncMonthlyMeetingParams = {
  instructorId: string;
  previousEventId: string | null;
  slot: GeneratedSlot;
  studentName: string | null;
  studentEmail: string;
};

/**
 * Delete previous Google event (if any) and create a new monthly series on the
 * instructor primary calendar. Returns the new event id, or null if Google
 * is not connected for this instructor.
 */
export async function syncMonthlyMeetingOnInstructorCalendar(
  params: SyncMonthlyMeetingParams
): Promise<string | null> {
  const calendar = await getCalendarClientForInstructor(params.instructorId);
  if (!calendar) return null;

  if (params.previousEventId) {
    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: params.previousEventId,
        sendUpdates: 'none',
      });
    } catch (err: unknown) {
      // Already deleted / not found — continue with create
      const status =
        (err as { code?: number | string; response?: { status?: number } })?.response
          ?.status ?? Number((err as { code?: number | string })?.code);
      if (status !== 404 && status !== 410) {
        console.warn('Failed to delete previous Google Calendar event:', err);
      }
    }
  }

  const studentLabel = params.studentName || params.studentEmail;
  const endLocal = formatEndHhMm(params.slot.localTime, MEETING_DURATION_MINUTES);
  const rrule = buildMonthlyByDayRrule(params.slot.dayOfWeek, params.slot.localDate);

  const created = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'none', // student already gets .ics from OfferInsight
    requestBody: {
      summary: `1:1 — ${studentLabel}`,
      description: [
        `OfferInsight monthly 1:1 with ${studentLabel}.`,
        `Standing time: ${DAY_LABELS[params.slot.dayOfWeek]}s at ${params.slot.localTime} (${params.slot.timezone}).`,
        `Duration: ${MEETING_DURATION_MINUTES} minutes.`,
        'Student can reschedule from their Account page.',
      ].join('\n'),
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
