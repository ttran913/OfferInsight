/** Instructor meeting location + preferred student-facing contact email. */

export const MEETING_LOCATION_TYPES = ['ONLINE', 'PHONE', 'IN_PERSON'] as const;
export type MeetingLocationType = (typeof MEETING_LOCATION_TYPES)[number];

export const MEETING_LOCATION_MAX_LENGTH = 500;

/** Select labels in the instructor UI. */
export const MEETING_LOCATION_TYPE_LABELS: Record<MeetingLocationType, string> = {
  ONLINE: 'Online meeting',
  PHONE: 'Phone',
  IN_PERSON: 'In person',
};

/** Short prefixes for student-facing location lines. */
const LOCATION_PREFIX: Record<MeetingLocationType, string> = {
  ONLINE: 'Online',
  PHONE: 'Phone',
  IN_PERSON: 'In person',
};

export const MEETING_LOCATION_PLACEHOLDERS: Record<MeetingLocationType, string> = {
  ONLINE: 'e.g. https://meet.google.com/abc-defg-hij',
  PHONE: 'e.g. +1 555-0100',
  IN_PERSON: 'e.g. Room 3B, 123 Main St',
};

export function isMeetingLocationType(value: unknown): value is MeetingLocationType {
  return (
    typeof value === 'string' &&
    (MEETING_LOCATION_TYPES as readonly string[]).includes(value)
  );
}

/** Null when value is empty; otherwise e.g. "Online: https://…". */
export function formatMeetingLocation(
  type: MeetingLocationType,
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return `${LOCATION_PREFIX[type]}: ${trimmed}`;
}

export function normalizeContactEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

/** Basic shape check; empty is allowed (caller clears to null). */
export function isValidContactEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type MeetingDetailsFields = {
  meetingLocationType: MeetingLocationType;
  meetingLocation: string | null;
  contactEmail: string | null;
};

/** Student-facing snapshot; omit empty fields as null. */
export function meetingDetailsPayload(
  instructor: {
    meetingLocationType?: MeetingLocationType | string | null;
    meetingLocation?: string | null;
    contactEmail?: string | null;
  } | null | undefined
): { location: string | null; contactEmail: string | null } {
  const type = isMeetingLocationType(instructor?.meetingLocationType)
    ? instructor.meetingLocationType
    : 'ONLINE';
  return {
    location: formatMeetingLocation(type, instructor?.meetingLocation),
    contactEmail: normalizeContactEmail(instructor?.contactEmail),
  };
}

/**
 * Parse PATCH fields for meeting location / contact email.
 * Only keys present on `body` are included in `data`.
 */
export function parseMeetingDetailsPatch(body: Record<string, unknown>):
  | { ok: true; data: Partial<MeetingDetailsFields> }
  | { ok: false; error: string } {
  const data: Partial<MeetingDetailsFields> = {};

  if ('meetingLocationType' in body) {
    if (!isMeetingLocationType(body.meetingLocationType)) {
      return { ok: false, error: 'meetingLocationType must be ONLINE, PHONE, or IN_PERSON' };
    }
    data.meetingLocationType = body.meetingLocationType;
  }

  if ('meetingLocation' in body) {
    if (typeof body.meetingLocation !== 'string') {
      return { ok: false, error: 'meetingLocation must be a string' };
    }
    const location = body.meetingLocation.trim();
    if (location.length > MEETING_LOCATION_MAX_LENGTH) {
      return {
        ok: false,
        error: `Meeting location must be ${MEETING_LOCATION_MAX_LENGTH} characters or fewer.`,
      };
    }
    data.meetingLocation = location || null;
  }

  if ('contactEmail' in body) {
    if (typeof body.contactEmail !== 'string') {
      return { ok: false, error: 'contactEmail must be a string' };
    }
    const email = body.contactEmail.trim();
    if (email && !isValidContactEmail(email)) {
      return { ok: false, error: 'contactEmail must be a valid email address' };
    }
    data.contactEmail = email || null;
  }

  return { ok: true, data };
}
