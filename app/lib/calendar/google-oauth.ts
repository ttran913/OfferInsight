import { createHmac, timingSafeEqual } from 'crypto';
import { google } from 'googleapis';
import { GOOGLE_CALENDAR_SCOPES } from './constants';

function requireGoogleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(requireGoogleEnv());
}

function getRedirectUri(): string {
  const base = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/instructor/calendar/google/callback`;
}

export function createOAuth2Client() {
  const env = requireGoogleEnv();
  if (!env) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured');
  }
  return new google.auth.OAuth2(env.clientId, env.clientSecret, getRedirectUri());
}

export function getGoogleAuthUrl(instructorId: string): string {
  const client = createOAuth2Client();
  const state = signOAuthState(instructorId);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state,
  });
}

function stateSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required for Google OAuth state');
  }
  return secret;
}

export function signOAuthState(instructorId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ instructorId, ts: Date.now() }),
    'utf8'
  ).toString('base64url');
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string): string | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      instructorId?: string;
      ts?: number;
    };
    if (!data.instructorId || typeof data.ts !== 'number') return null;
    // 15 minute validity
    if (Date.now() - data.ts > 15 * 60 * 1000) return null;
    return data.instructorId;
  } catch {
    return null;
  }
}
