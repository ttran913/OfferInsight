import { prisma } from '@/db';
import { sendEmail } from '@/app/lib/email';
import { deleteMonthlyMeetingEvent } from './google-calendar';
import { buildMeetingCancelledInstructorEmail, buildMonthlyMeetingCancelIcs } from './ics';
import { emailInstructor } from './instructor-email';
import { seriesAnchorSlot } from './next-occurrence';

/**
 * Cancel a student's monthly 1:1 series everywhere: the instructor's Google event,
 * the series row (and its one-time moves), and the student's calendar via an
 * emailed cancel .ics attached to `mail`. The instructor is emailed too.
 */
export async function unscheduleMonthlyMeeting({
  meeting,
  user,
  instructorName,
  mail,
  cancelledBecause,
}: {
  meeting: {
    id: string;
    instructorId: string;
    googleEventId: string | null;
    weeklyKey: string;
    dayOfWeek: number;
    localTime: string;
    timezone: string;
    firstOccurrence: Date;
  };
  user: { name: string | null; email: string | null };
  /** Instructor of the series being cancelled (shown in the .ics) */
  instructorName: string;
  /** Omit to cancel without emailing the student */
  mail?: { subject: string; text: string; html: string };
  /** Why, for the instructor's email: completes "...was cancelled because ..." */
  cancelledBecause: string;
}): Promise<{ emailSent: boolean }> {
  if (meeting.googleEventId) {
    await deleteMonthlyMeetingEvent(meeting.instructorId, meeting.googleEventId);
  }
  await prisma.studentMonthlyMeeting.delete({ where: { id: meeting.id } });

  await emailInstructor(
    meeting.instructorId,
    buildMeetingCancelledInstructorEmail({
      studentName: user.name || user.email || 'A student',
      slot: seriesAnchorSlot(meeting),
      because: cancelledBecause,
      calendarUpdated: Boolean(meeting.googleEventId),
    })
  );

  if (!mail || !user.email) return { emailSent: false };
  try {
    const ics = buildMonthlyMeetingCancelIcs({
      slot: seriesAnchorSlot(meeting),
      studentName: user.name,
      studentEmail: user.email,
      instructorName,
    });
    await sendEmail({
      to: user.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: [
        {
          filename: ics.filename,
          content: ics.content,
          contentType: 'text/calendar; charset=utf-8; method=CANCEL',
        },
      ],
    });
    return { emailSent: true };
  } catch (err) {
    console.error('Failed to send meeting cancellation email:', err);
    return { emailSent: false };
  }
}
