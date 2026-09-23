import { NextResponse } from 'next/server';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import { canInstructorMutateUserData } from '@/app/lib/instructor-permissions';
import { prisma } from '@/db';

export async function POST() {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!canInstructorMutateUserData(instructor)) {
      return NextResponse.json(
        { error: 'Read-only instructors cannot disconnect Google Calendar' },
        { status: 403 }
      );
    }

    await prisma.instructorGoogleCalendar.deleteMany({
      where: { instructorId: instructor.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
