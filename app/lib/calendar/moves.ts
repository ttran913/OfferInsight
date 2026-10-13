import { MEETING_DURATION_MINUTES, type AvailabilityWindowInput } from './constants';
import type { BusyInterval } from './conflicts';
import { localDateKey } from './month-grid';
import { anchorLocalDateFromOccurrence, getNextMonthlyOccurrence } from './next-occurrence';
import { generateAvailableSlots, getZonedParts, zonedWallTimeToUtc, type GeneratedSlot } from './slots';

type SeriesFields = {
  dayOfWeek: number;
  localTime: string;
  timezone: string;
  firstOccurrence: Date;
};

export type MoveFields = { originalStart: Date; newStart: Date };

export type UpcomingMeeting = {
  startIso: string;
  /** YYYY-MM-DD in the meeting timezone */
  localDate: string;
  /** HH:mm in the meeting timezone */
  localTime: string;
  /** ISO start of the regular date this meeting was moved from, one time only */
  movedFrom: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Next regular (nth-weekday) date at or after `from`, never before the series starts. */
function nextRegular(meeting: SeriesFields, from: Date, excludedStarts: Date[] = []) {
  return getNextMonthlyOccurrence({
    dayOfWeek: meeting.dayOfWeek,
    localTime: meeting.localTime,
    timezone: meeting.timezone,
    anchorLocalDate: anchorLocalDateFromOccurrence(meeting.firstOccurrence, meeting.timezone),
    now: from < meeting.firstOccurrence ? meeting.firstOccurrence : from,
    excludedStarts,
  });
}

/** The student's next actual meeting: a regular date that wasn't moved, or a one-time move. */
export function nextMeeting(
  meeting: SeriesFields,
  moves: MoveFields[],
  now = new Date()
): UpcomingMeeting | null {
  const regular = nextRegular(
    meeting,
    now,
    moves.map((m) => m.originalStart)
  );
  const move = moves
    .filter((m) => m.newStart >= now)
    .sort((a, b) => a.newStart.getTime() - b.newStart.getTime())[0];

  if (move && (!regular || move.newStart.getTime() < Date.parse(regular.startIso))) {
    const p = getZonedParts(move.newStart, meeting.timezone);
    return {
      startIso: move.newStart.toISOString(),
      localDate: localDateKey(move.newStart, meeting.timezone),
      localTime: `${pad2(p.hour)}:${pad2(p.minute)}`,
      movedFrom: move.originalStart.toISOString(),
    };
  }
  return regular ? { ...regular, movedFrom: null } : null;
}

export type MoveTarget = {
  /** Regular date being moved (or already moved) one time */
  originalStart: Date;
  /** The existing one-time move for that date, if any */
  move: MoveFields | null;
  /** Next regular meeting after the moved one */
  followingStart: Date | null;
  /** One-time moves must start before this (start of the following meeting's day) */
  windowEnd: Date;
};

/** The only meeting a student may move one time: their next one. */
export function oneTimeMoveTarget(
  meeting: SeriesFields,
  moves: MoveFields[],
  now = new Date()
): MoveTarget | null {
  const next = nextMeeting(meeting, moves, now);
  if (!next) return null;
  const originalStart = new Date(next.movedFrom ?? next.startIso);
  const move = moves.find((m) => m.originalStart.getTime() === originalStart.getTime()) ?? null;

  const following = nextRegular(meeting, new Date(originalStart.getTime() + 1));
  let windowEnd: Date;
  if (following) {
    const [y, m, d] = following.localDate.split('-').map(Number);
    windowEnd = zonedWallTimeToUtc(y, m, d, 0, 0, meeting.timezone);
  } else {
    windowEnd = new Date(originalStart.getTime() + 28 * 24 * 60 * 60 * 1000);
  }

  return {
    originalStart,
    move,
    followingStart: following ? new Date(following.startIso) : null,
    windowEnd,
  };
}

/** Start instants (ms) of a series' actual meetings in [from, to), counting one-time moves. */
export function meetingStartsBetween(
  meeting: SeriesFields,
  moves: MoveFields[],
  from: Date,
  to: Date
): number[] {
  const movedOriginals = moves.map((m) => m.originalStart);
  const starts: number[] = [];
  let cursor = from;
  for (let i = 0; i < 24; i++) {
    const regular = nextRegular(meeting, cursor, movedOriginals);
    if (!regular) break;
    const ms = Date.parse(regular.startIso);
    if (ms >= to.getTime()) break;
    starts.push(ms);
    cursor = new Date(ms + 1);
  }
  for (const m of moves) {
    const ms = m.newStart.getTime();
    if (ms >= from.getTime() && ms < to.getTime()) starts.push(ms);
  }
  return starts.sort((a, b) => a - b);
}

export type OneTimeDay = {
  localDate: string;
  dayOfWeek: number;
  slots: GeneratedSlot[];
};

/**
 * Open times for moving one meeting: inside the instructor's weekly hours, from now
 * until `windowEnd`, clear of Google busy time and other students' meetings.
 */
export function findOneTimeSlots(opts: {
  windows: AvailabilityWindowInput[];
  timezone: string;
  now: Date;
  windowEnd: Date;
  busy: BusyInterval[];
  /** Start instants (ms) of other students' meetings with the same instructor */
  taken: number[];
  /** Starts the student can't pick (their original time, their current one-time time) */
  excludeStarts: Date[];
  durationMinutes?: number;
}): OneTimeDay[] {
  const durationMs = (opts.durationMinutes ?? MEETING_DURATION_MINUTES) * 60 * 1000;
  const excluded = new Set(opts.excludeStarts.map((d) => d.getTime()));
  const slots = generateAvailableSlots({
    windows: opts.windows,
    timezone: opts.timezone,
    durationMinutes: opts.durationMinutes,
    now: opts.now,
    rangeStart: opts.now,
    rangeEnd: opts.windowEnd,
  });

  const days = new Map<string, OneTimeDay>();
  for (const slot of slots) {
    const start = Date.parse(slot.start);
    const end = start + durationMs;
    if (excluded.has(start)) continue;
    if (opts.taken.some((t) => t < end && start < t + durationMs)) continue;
    if (opts.busy.some((b) => Date.parse(b.start) < end && start < Date.parse(b.end))) continue;

    const day = days.get(slot.localDate) ?? {
      localDate: slot.localDate,
      dayOfWeek: slot.dayOfWeek,
      slots: [],
    };
    day.slots.push(slot);
    days.set(slot.localDate, day);
  }
  return [...days.values()];
}
