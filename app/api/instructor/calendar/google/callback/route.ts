import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getInstructorSession } from '@/app/lib/instructor-auth';
import { createOAuth2Client, verifyOAuthState } from '@/app/lib/calendar/google-oauth';
import { encryptToken } from '@/app/lib/calendar/token-crypto';
import { prisma } from '@/db';

function dashboardRedirect(error?: string) {
  const base = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  const url = new URL(`${base}/instructor/dashboard`);
  url.searchParams.set('tab', 'calendar');
  if (error) url.searchParams.set('calendarError', error);
  else url.searchParams.set('calendarConnected', '1');
  return NextResponse.redirect(url.toString());
}

export async function GET(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return dashboardRedirect('not_signed_in');
    }

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const oauthError = request.nextUrl.searchParams.get('error');

    if (oauthError) {
      return dashboardRedirect(oauthError);
    }
    if (!code || !state) {
      return dashboardRedirect('missing_code');
    }

    const stateInstructorId = verifyOAuthState(state);
    if (!stateInstructorId || stateInstructorId !== instructor.id) {
      return dashboardRedirect('invalid_state');
    }

    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) {
      return dashboardRedirect('no_access_token');
    }

    const existing = await prisma.instructorGoogleCalendar.findUnique({
      where: { instructorId: instructor.id },
    });

    if (!tokens.refresh_token && !existing?.refreshTokenEnc) {
      return dashboardRedirect('no_refresh_token');
    }

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const profile = await oauth2.userinfo.get();
    const googleEmail = profile.data.email ?? null;

    const accessTokenEnc = encryptToken(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : existing!.refreshTokenEnc;

    await prisma.instructorGoogleCalendar.upsert({
      where: { instructorId: instructor.id },
      create: {
        instructorId: instructor.id,
        googleEmail,
        accessTokenEnc,
        refreshTokenEnc,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope ?? null,
      },
      update: {
        googleEmail,
        accessTokenEnc,
        ...(tokens.refresh_token ? { refreshTokenEnc: encryptToken(tokens.refresh_token) } : {}),
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope ?? null,
      },
    });

    return dashboardRedirect();
  } catch (error) {
    console.error('Google Calendar OAuth callback error:', error);
    return dashboardRedirect('callback_failed');
  }
}
