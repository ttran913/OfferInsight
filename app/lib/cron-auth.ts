import { NextRequest, NextResponse } from 'next/server';

/**
 * Checks the `Authorization: Bearer $CRON_SECRET` header Vercel Cron sends.
 * Returns an error response to send back, or null when the request may proceed.
 */
export function authorizeCronRequest(request: NextRequest): NextResponse | null {
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken) {
    console.error('CRON_SECRET environment variable is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
