import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/db';
import { getUserIdForRequest } from '@/app/lib/api-user-helper';

export async function GET(request: NextRequest) {
  try {
    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        school: true,
        major: true,
        expectedGraduationDate: true,
        monthsToSecureInternship: true,
        commitment: true,
        appsWithOutreachPerWeek: true,
        networkingPerMonth: true,
        resetStartDate: true,
        onboardingProgress: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json({ error: 'Failed to fetch user data.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, error } = await getUserIdForRequest(request);

    if (error || !userId) {
      return NextResponse.json({ error: error || 'Not authenticated' }, { status: 401 });
    }

    const { monthsToSecureInternship, commitment, appsWithOutreachPerWeek, networkingPerMonth } = await request.json();

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        monthsToSecureInternship,
        commitment,
        appsWithOutreachPerWeek,
        networkingPerMonth,
        onboardingProgress: 2,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user information:', error);
    return NextResponse.json({ error: 'Failed to update user information.' }, { status: 500 });
  }
}