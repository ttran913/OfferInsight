import { NextResponse } from 'next/server';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import { prisma } from '@/db';

export async function POST() {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
