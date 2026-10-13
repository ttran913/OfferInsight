import { prisma } from '@/db';
import { INSTRUCTOR_DISPLAY_NAME_FALLBACK } from './constants';
import {
  chooseDefaultInstructorId,
  chooseSchedulingInstructorId,
  instructorLabel,
  type SchedulingCandidate,
} from './instructor-choice';

export type AssignableInstructor = {
  id: string;
  label: string;
};

/** Display name used in student-facing copy and calendar invites. */
export function getInstructorDisplayName(
  instructor: { displayName: string | null } | null | undefined
): string {
  return instructor?.displayName?.trim() || INSTRUCTOR_DISPLAY_NAME_FALLBACK;
}

/** Instructors students can book with (all roles), oldest first, with availability. */
async function loadSchedulingInstructors() {
  return prisma.instructor.findMany({
    include: {
      availabilityWindows: {
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

type SchedulingInstructor = Awaited<ReturnType<typeof loadSchedulingInstructors>>[number];

function toCandidates(instructors: SchedulingInstructor[]): SchedulingCandidate[] {
  return instructors.map((i) => ({
    id: i.id,
    isDefaultScheduler: i.isDefaultScheduler,
    hasAvailability: i.availabilityWindows.length > 0,
  }));
}

/** Instructor that unassigned students book with, or null if there are no instructors. */
export async function resolveDefaultInstructor(): Promise<SchedulingInstructor | null> {
  const instructors = await loadSchedulingInstructors();
  const id = chooseDefaultInstructorId(toCandidates(instructors));
  return instructors.find((i) => i.id === id) ?? null;
}

/**
 * Instructor a student schedules with: assigned instructor, else the instructor of
 * their existing meeting, else the default instructor.
 */
export async function resolveSchedulingInstructorForUser(
  userId: string
): Promise<SchedulingInstructor | null> {
  const [user, instructors] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        assignedInstructorId: true,
        monthlyMeeting: { select: { instructorId: true } },
      },
    }),
    loadSchedulingInstructors(),
  ]);

  const id = chooseSchedulingInstructorId({
    assignedInstructorId: user?.assignedInstructorId ?? null,
    meetingInstructorId: user?.monthlyMeeting?.instructorId ?? null,
    candidates: toCandidates(instructors),
  });
  return instructors.find((i) => i.id === id) ?? null;
}

/** One query's worth of instructor data for resolving many students at once (list views). */
export async function loadSchedulingRoster() {
  const all = await loadSchedulingInstructors();
  const candidates = toCandidates(all);
  const instructors: AssignableInstructor[] = all.map((i) => ({
    id: i.id,
    label: instructorLabel(i),
  }));

  return {
    instructors,
    defaultInstructorId: chooseDefaultInstructorId(candidates),
    effectiveInstructorId(
      assignedInstructorId: string | null,
      meetingInstructorId: string | null
    ): string | null {
      return chooseSchedulingInstructorId({ assignedInstructorId, meetingInstructorId, candidates });
    },
  };
}
