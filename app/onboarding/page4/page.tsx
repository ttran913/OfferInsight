"use client"

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import MonthlyMeetingScheduler from '@/components/monthly-meeting-scheduler';

export default function OnboardingPage4() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100dvh-var(--navbar-height))] bg-white flex items-center justify-center px-4 py-8">
      <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-10 w-full max-w-2xl">
        <div className="mb-6">
          <Link
            href="/onboarding/page3"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            Schedule your monthly 1:1
          </h1>
          <p className="text-gray-500 text-center mt-2 text-sm">
            Required meetings once per month — pick a standing time that works for you.
          </p>
        </div>

        <MonthlyMeetingScheduler
          showSkip
          onSkip={() => router.push('/dashboard')}
          onSaved={() => router.push('/dashboard')}
        />
      </div>
    </div>
  );
}
