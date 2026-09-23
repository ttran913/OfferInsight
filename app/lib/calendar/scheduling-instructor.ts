import { prisma } from '@/db';
import { INSTRUCTOR_ROLES } from '@/app/lib/instructor-permissions';

/** Display name used in student-facing copy and calendar invites. */
export function getInstructorDisplayName(): string {
  return process.env.INSTRUCTOR_DISPLAY_NAME?.trim() || 'Utsab';
}

/**
 * Instructor students book against: first ADMIN who has availability windows,
 * else first ADMIN, else null.
 */
export async function resolveSchedulingInstructor() {
  const admins = await prisma.instructor.findMany({
    where: { role: INSTRUCTOR_ROLES.ADMIN },
    include: {
      availabilityWindows: {
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (admins.length === 0) return null;

  const withWindows = admins.find((a) => a.availabilityWindows.length > 0);
  return withWindows ?? admins[0];
}
