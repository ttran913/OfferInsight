import { NextResponse } from 'next/server';
import { auth } from 'auth';
import { buildSkippedBookingEmail, sendEmail } from '@/app/lib/email';
import { bookByDate, deadlineLabel, startedBookingClock } from '@/app/lib/must-book';
import { prisma } from '@/db';

/**
 * "Skip for now" on the booking page: finishes onboarding without a meeting and starts
 * the 72h/96h clock. Never restarts a running clock, and does nothing for students who
 * already have a meeting or were removed.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        onboardingProgress: true,
        mustBookSince: true,
        removedFromResumeBook: true,
        monthlyMeeting: { select: { id: true } },
      },
    });
    if (!user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const startClock = !user.monthlyMeeting && !user.mustBookSince && !user.removedFromResumeBook;
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        onboardingProgress: Math.max(user.onboardingProgress, 4),
        ...(startClock ? startedBookingClock('skippedOnboarding', now) : {}),
      },
    });
    if (!startClock) {
      return NextResponse.json({ clockStarted: false, emailSent: false });
    }

    let emailSent = false;
    try {
      await sendEmail({
        to: user.email,
        ...buildSkippedBookingEmail({
          studentName: user.name,
          bookByLabel: deadlineLabel(bookByDate(now)),
        }),
      });
      emailSent = true;
    } catch (err) {
      console.error('Failed to send skipped-booking email:', err);
    }
    return NextResponse.json({ clockStarted: true, emailSent });
  } catch (error) {
    console.error('Error skipping onboarding booking:', error);
    return NextResponse.json({ error: 'Failed to skip booking.' }, { status: 500 });
  }
}
