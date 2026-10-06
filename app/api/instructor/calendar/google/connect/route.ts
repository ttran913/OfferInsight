import { NextResponse } from 'next/server';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import {
  getGoogleAuthUrl,
  isGoogleCalendarConfigured,
} from '@/app/lib/calendar/google-oauth';

export async function GET() {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!isGoogleCalendarConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google Calendar is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        },
        { status: 503 }
      );
    }

    const url = getGoogleAuthUrl(instructor.id);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Error starting Google Calendar connect:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
