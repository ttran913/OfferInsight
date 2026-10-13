import { NextRequest, NextResponse } from 'next/server';
import {
  getInstructorDisplayName,
  resolveSchedulingInstructorForUser,
} from '@/app/lib/calendar/scheduling-instructor';
import { authorizeCronRequest } from '@/app/lib/cron-auth';
import {
  buildBookingFinalWarningEmail,
  buildRemovalNoticeEmail,
  sendEmail,
} from '@/app/lib/email';
import {
  bookingStage,
  CLEARED_BOOKING_CLOCK,
  deadlineLabel,
  isMustBookReason,
  removeByDate,
} from '@/app/lib/must-book';
import { prisma } from '@/db';

type MustBookResult = {
  userId: string;
  email: string;
  action: 'finalWarning' | 'removal' | 'cleared';
  success: boolean;
  error?: string;
};

/**
 * Daily: students on the "book a monthly 1:1" clock get a final warning at 72 hours
 * and are removed from the Resume Book at 96 hours. `?dryRun=true` only lists them.
 */
export async function GET(request: NextRequest) {
  try {
    const denied = authorizeCronRequest(request);
    if (denied) return denied;

    const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true';
    const now = new Date();

    const users = await prisma.user.findMany({
      where: { mustBookSince: { not: null }, removedFromResumeBook: false },
      select: {
        id: true,
        name: true,
        email: true,
        mustBookSince: true,
        mustBookReason: true,
        bookFinalWarningSentAt: true,
        monthlyMeeting: { select: { id: true } },
        missedMeetings: {
          orderBy: { occurrenceStart: 'desc' },
          take: 1,
          select: { occurrenceStart: true },
        },
      },
    });

    const results: MustBookResult[] = [];
    for (const user of users) {
      if (!user.email || !user.mustBookSince) continue;
      const base = { userId: user.id, email: user.email, success: true };

      if (user.monthlyMeeting) {
        if (!dryRun) {
          await prisma.user.update({ where: { id: user.id }, data: CLEARED_BOOKING_CLOCK });
        }
        results.push({ ...base, action: 'cleared' });
        continue;
      }

      const reason = isMustBookReason(user.mustBookReason) ? user.mustBookReason : 'skippedOnboarding';
      const stage = bookingStage(user, now);

      if (stage === 'finalWarning') {
        const result: MustBookResult = { ...base, action: 'finalWarning' };
        if (!dryRun) {
          try {
            const missed = user.missedMeetings[0]?.occurrenceStart;
            const mail = buildBookingFinalWarningEmail({
              studentName: user.name,
              reason,
              instructorName: getInstructorDisplayName(
                await resolveSchedulingInstructorForUser(user.id)
              ),
              missedLabel: missed ? deadlineLabel(missed) : null,
              removeByLabel: deadlineLabel(
                removeByDate({ mustBookSince: user.mustBookSince, bookFinalWarningSentAt: now })
              ),
            });
            await sendEmail({ to: user.email, ...mail });
            await prisma.user.update({
              where: { id: user.id },
              data: { bookFinalWarningSentAt: now },
            });
          } catch (error) {
            result.success = false;
            result.error = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to send booking final warning to ${user.email}:`, result.error);
          }
        }
        results.push(result);
      } else if (stage === 'remove') {
        const result: MustBookResult = { ...base, action: 'removal' };
        if (!dryRun) {
          try {
            await sendEmail({ to: user.email, ...buildRemovalNoticeEmail(user.name, reason) });
            await prisma.user.update({
              where: { id: user.id },
              data: { removedFromResumeBook: true, ...CLEARED_BOOKING_CLOCK },
            });
          } catch (error) {
            result.success = false;
            result.error = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to remove ${user.email} for not booking:`, result.error);
          }
        }
        results.push(result);
      }
    }

    const ok = (action: MustBookResult['action']) =>
      results.filter((r) => r.action === action && r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const summary = {
      finalWarnings: ok('finalWarning'),
      removals: ok('removal'),
      cleared: ok('cleared'),
    };
    console.log(
      `Must-book clock${dryRun ? ' (dry run)' : ''}: ${summary.finalWarnings} final warnings, ${summary.removals} removals, ${summary.cleared} cleared, ${failed} failed, ${users.length} on a clock.`
    );

    return NextResponse.json({
      message: 'Must-book job completed',
      dryRun,
      processed: users.length,
      summary,
      failed,
      details: results,
    });
  } catch (error) {
    console.error('Error in must-book cron job:', error);
    return NextResponse.json({ error: 'Failed to process must-book clocks' }, { status: 500 });
  }
}
