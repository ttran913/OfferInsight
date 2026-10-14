import { prisma } from '@/db';
import { sendEmail } from '@/app/lib/email';

/**
 * Email an instructor about one of their students' meetings. Instructors have no address
 * on file other than the Google account they connected, so this is skipped without one.
 */
export async function emailInstructor(
  instructorId: string,
  mail: { subject: string; text: string; html: string }
): Promise<boolean> {
  try {
    const connection = await prisma.instructorGoogleCalendar.findUnique({
      where: { instructorId },
      select: { googleEmail: true },
    });
    if (!connection?.googleEmail) return false;
    await sendEmail({ to: connection.googleEmail, ...mail });
    return true;
  } catch (err) {
    console.error('Failed to email instructor:', err);
    return false;
  }
}
