import {
  anchorLocalDateFromOccurrence,
  getNextMonthlyOccurrence,
} from './next-occurrence';

export const SKIP_REASON_MAX_LENGTH = 500;

type SeriesFields = {
  dayOfWeek: number;
  localTime: string;
  timezone: string;
  firstOccurrence: Date;
};

type SkipFields = { occurrenceStart: Date };

/** The skip that hasn't happened yet (at most one exists). */
export function findPendingSkip<T extends SkipFields>(skips: T[], now = new Date()): T | null {
  return skips.find((s) => s.occurrenceStart.getTime() > now.getTime()) ?? null;
}

/** Next meeting the student will actually attend, stepping past skipped dates. */
export function nextAttendedOccurrence(
  meeting: SeriesFields,
  skips: SkipFields[],
  now = new Date()
) {
  return getNextMonthlyOccurrence({
    dayOfWeek: meeting.dayOfWeek,
    localTime: meeting.localTime,
    timezone: meeting.timezone,
    anchorLocalDate: anchorLocalDateFromOccurrence(meeting.firstOccurrence, meeting.timezone),
    now,
    skippedStarts: skips.map((s) => s.occurrenceStart),
  });
}

export type SkipPlan =
  | { ok: true; occurrenceStart: Date }
  | { ok: false; error: string };

/** Only the next upcoming meeting can be skipped, and only one skip may be pending. */
export function planSkip(meeting: SeriesFields, skips: SkipFields[], now = new Date()): SkipPlan {
  if (findPendingSkip(skips, now)) {
    return {
      ok: false,
      error: 'You already skipped your next meeting. Undo that skip before skipping another.',
    };
  }
  const next = nextAttendedOccurrence(meeting, skips, now);
  if (!next) return { ok: false, error: 'No upcoming meeting to skip.' };
  return { ok: true, occurrenceStart: new Date(next.startIso) };
}

export function normalizeSkipReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, SKIP_REASON_MAX_LENGTH);
  return trimmed || null;
}
