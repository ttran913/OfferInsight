import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/db'
import { getInstructorSession } from '@/app/lib/instructor-auth'
import { mustFinishBookingStep } from '@/app/lib/must-book'

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Check if this is an instructor (instructors can view any user's dashboard)
  const instructor = await getInstructorSession()
  if (instructor) {
    // Instructor is viewing a user's dashboard - allow access
    return <div className="bg-white text-gray-900">{children}</div>
  }
  
  // Normal user session check
  const session = await auth()
  if (!session?.user?.email) redirect('/')
  
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { onboardingProgress: true, createdAt: true, monthlyMeeting: { select: { id: true } } }
  })
  const progress = user?.onboardingProgress ?? 0

  if (
    user &&
    mustFinishBookingStep({
      createdAt: user.createdAt,
      onboardingProgress: progress,
      hasMeeting: Boolean(user.monthlyMeeting),
    })
  ) {
    redirect('/onboarding/page4')
  }

  switch (progress) {
    case 0:
      redirect('/onboarding/page1')
    case 1:
      redirect('/onboarding/page2')
    case 2:
      redirect('/onboarding/page3')
    case 3:
    case 4:
    default:
      // Dashboard allowed at 3 for accounts from before the booking step was required, and at 4 (booked or skipped)
      break
  }

  return <div className="bg-white text-gray-900">{children}</div>
}
