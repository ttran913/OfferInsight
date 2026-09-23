export function getUserDashboardPath(onboardingProgress: number | null | undefined): string {
  switch (onboardingProgress) {
    case 0:
      return '/onboarding/page1';
    case 1:
      return '/onboarding/page2';
    case 2:
      return '/onboarding/page3';
    case 3:
      // Soft: dashboard allowed without a meeting; page4 is offered in the funnel after page3
      return '/dashboard';
    case 4:
      return '/dashboard';
    default:
      return '/onboarding/page1';
  }
}
