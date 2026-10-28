import { NextRequest, NextResponse } from 'next/server';
import { buildMeetingReminderEmail } from '@/app/lib/calendar/ics';
import { meetingDetailsPayload } from '@/app/lib/calendar/meeting-details';
import { formatNextMeetingLabel } from '@/app/lib/calendar/next-occurrence';
import { occurrenceNeedingReminder } from '@/app/lib/calendar/reminders';
import { getInstructorDisplayName } from '@/app/lib/calendar/scheduling-instructor';
import { authorizeCronRequest } from '@/app/lib/cron-auth';
import { sendEmail } from '@/app/lib/email';
import { prisma } from '@/db';

type ReminderResult = {
  meetingId: string;
  email: string;
  occurrenceStart: string;
  success: boolean;
  error?: string;
};

/** Daily: email each student whose monthly 1:1 is tomorrow. `?dryRun=true` only lists them. */
export async function GET(request: NextRequest) {
  try {
    const denied = authorizeCronRequest(request);
    if (denied) return denied;

    const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true';
    const now = new Date();

    const meetings = await prisma.studentMonthlyMeeting.findMany({
      select: {
        id: true,
        dayOfWeek: true,
        localTime: true,
        timezone: true,
        firstOccurrence: true,
        lastReminderFor: true,
        user: { select: { name: true, email: true } },
        instructor: {
          select: {
            displayName: true,
            meetingLocationType: true,
            meetingLocation: true,
            contactEmail: true,
          },
        },
        moves: {
          where: { OR: [{ originalStart: { gt: now } }, { newStart: { gt: now } }] },
          select: { originalStart: true, newStart: true },
        },
      },
    });

    const results: ReminderResult[] = [];
    for (const meeting of meetings) {
      const email = meeting.user.email;
      if (!email) continue;
      const next = occurrenceNeedingReminder(meeting, meeting.moves, now);
      if (!next) continue;

      const result: ReminderResult = {
        meetingId: meeting.id,
        email,
        occurrenceStart: next.startIso,
        success: true,
      };
      if (!dryRun) {
        try {
          const details = meetingDetailsPayload(meeting.instructor);
          const mail = buildMeetingReminderEmail({
            studentName: meeting.user.name,
            instructorName: getInstructorDisplayName(meeting.instructor),
            occurrenceLabel: formatNextMeetingLabel(next.startIso, meeting.timezone),
            meetingLocation: details.location,
            contactEmail: details.contactEmail,
          });
          await sendEmail({ to: email, ...mail });
          await prisma.studentMonthlyMeeting.update({
            where: { id: meeting.id },
            data: { lastReminderFor: new Date(next.startIso) },
          });
        } catch (error) {
          result.success = false;
          result.error = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to send meeting reminder to ${email}:`, result.error);
        }
      }
      results.push(result);
    }

    const failed = results.filter((r) => !r.success).length;
    console.log(
      `Meeting reminders${dryRun ? ' (dry run)' : ''}: ${results.length - failed} ${dryRun ? 'due' : 'sent'}, ${failed} failed, ${meetings.length} meetings checked.`
    );

    return NextResponse.json({
      message: 'Meeting reminder job completed',
      dryRun,
      processed: meetings.length,
      sent: dryRun ? 0 : results.length - failed,
      failed,
      details: results,
    });
  } catch (error) {
    console.error('Error in meeting reminder cron job:', error);
    return NextResponse.json({ error: 'Failed to process meeting reminders' }, { status: 500 });
  }
}
