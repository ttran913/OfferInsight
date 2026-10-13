/** Pure helpers for picking which instructor a student schedules with (no Prisma). */

export type SchedulingCandidate = {
  id: string;
  isDefaultScheduler: boolean;
  hasAvailability: boolean;
};

/** Instructor-facing label: display name, else username. */
export function instructorLabel(instructor: { displayName: string | null; username: string }): string {
  return instructor.displayName?.trim() || instructor.username;
}

/**
 * Default instructor for unassigned students: the one flagged isDefaultScheduler,
 * else the first with availability, else the first candidate. Candidates are all
 * instructors in creation order.
 */
export function chooseDefaultInstructorId(candidates: SchedulingCandidate[]): string | null {
  return (
    candidates.find((c) => c.isDefaultScheduler)?.id ??
    candidates.find((c) => c.hasAvailability)?.id ??
    candidates[0]?.id ??
    null
  );
}

/**
 * Order: assigned instructor → instructor of the student's existing meeting →
 * default instructor.
 */
export function chooseSchedulingInstructorId(opts: {
  assignedInstructorId: string | null;
  meetingInstructorId: string | null;
  candidates: SchedulingCandidate[];
}): string | null {
  return (
    opts.assignedInstructorId ??
    opts.meetingInstructorId ??
    chooseDefaultInstructorId(opts.candidates)
  );
}
