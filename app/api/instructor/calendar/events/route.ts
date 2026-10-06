import { NextResponse } from 'next/server';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import { DEFAULT_AVAILABILITY_TIMEZONE } from '@/app/lib/calendar/constants';
import { listPrimaryCalendarEvents } from '@/app/lib/calendar/google-calendar';
import type { CalendarEventItem } from '@/app/lib/calendar/month-grid';
import { getZonedParts, zonedWallTimeToUtc } from '@/app/lib/calendar/slots';
import { prisma } from '@/db';

function isGoogleAuthError(err: unknown): boolean {
  const e = err as {
    code?: number | string;
    message?: string;
    response?: { status?: number; data?: { error?: string } };
  };
  const status = e?.response?.status ?? Number(e?.code);
  return (
    status === 401 ||
    status === 403 ||
    e?.response?.data?.error === 'invalid_grant' ||
    (typeof e?.message === 'string' && e.message.includes('invalid_grant'))
  );
}

export async function GET() {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const timezone = DEFAULT_AVAILABILITY_TIMEZONE;
    const now = getZonedParts(new Date(), timezone);
    // 0-based index of the month after next; the range covers this month and next.
    const endMonthIndex = now.month + 1;
    const rangeStart = zonedWallTimeToUtc(now.year, now.month, 1, 0, 0, timezone);
    const rangeEnd = zonedWallTimeToUtc(
      now.year + Math.floor(endMonthIndex / 12),
      (endMonthIndex % 12) + 1,
      1,
      0,
      0,
      timezone
    );

    let googleEvents;
    try {
      googleEvents = await listPrimaryCalendarEvents(instructor.id, rangeStart, rangeEnd);
    } catch (err) {
      if (isGoogleAuthError(err)) {
        return NextResponse.json({ connected: true, error: 'reconnect', events: [] });
      }
      throw err;
    }

    if (!googleEvents) {
      return NextResponse.json({ connected: false, timezone, events: [] });
    }

    const meetings = await prisma.studentMonthlyMeeting.findMany({
      where: { instructorId: instructor.id, googleEventId: { not: null } },
      select: { googleEventId: true },
    });
    const offerInsightIds = new Set(meetings.map((m) => m.googleEventId as string));

    const events: CalendarEventItem[] = googleEvents
      .filter((e) => e.id && (e.start?.dateTime || e.start?.date))
      .map((e) => {
        const allDay = !e.start?.dateTime;
        return {
          id: e.id as string,
          title: e.summary || '(No title)',
          start: (allDay ? e.start?.date : e.start?.dateTime) as string,
          end: (allDay ? e.end?.date : e.end?.dateTime) ?? null,
          allDay,
          location: e.location ?? null,
          htmlLink: e.htmlLink ?? null,
          meetLink: e.hangoutLink ?? null,
          isOfferInsight:
            offerInsightIds.has(e.id as string) ||
            (e.recurringEventId ? offerInsightIds.has(e.recurringEventId) : false),
        };
      });

    return NextResponse.json({
      connected: true,
      timezone,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      events,
    });
  } catch (error) {
    console.error('Error listing instructor Google Calendar events:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
