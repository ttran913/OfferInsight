import { NextResponse } from 'next/server';
import { prisma } from '@/db';
import { auth } from 'auth';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { 
      commitment, 
      appsWithOutreachPerWeek, 
      networkingPerMonth,
      targetOfferDate,
      resetStartDate,
    } = await request.json();

    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        commitment,
        appsWithOutreachPerWeek,
        networkingPerMonth,
        targetOfferDate: targetOfferDate ? new Date(targetOfferDate) : undefined,
        resetStartDate: resetStartDate ? new Date(resetStartDate) : undefined,
        onboardingProgress: 3,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user plan:', error);
    return NextResponse.json({ error: 'Failed to update user plan.' }, { status: 500 });
  }
} 