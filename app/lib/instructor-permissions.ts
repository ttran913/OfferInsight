/** Pure permission helpers — not a "use server" module (Next requires async exports there). */

export const INSTRUCTOR_ROLES = {
  ADMIN: "ADMIN",
  READ_ONLY: "READ_ONLY",
} as const;

/** Editing students' data (kanban boards, reinstating). Read-only instructors can only view. */
export function canInstructorMutateUserData(instructor: { role?: string } | null) {
  if (!instructor) return false;
  return instructor.role !== INSTRUCTOR_ROLES.READ_ONLY;
}

/** Choosing which instructor each student meets with, and the default instructor. */
export function canInstructorAssignStudents(instructor: { role?: string } | null) {
  return instructor?.role === INSTRUCTOR_ROLES.ADMIN;
}
