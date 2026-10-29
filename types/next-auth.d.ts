import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      emailVerified?: Date | null
      image?: string | null
      onboardingProgress?: number | null
      targetOfferDate?: Date | null
      appsWithOutreachPerWeek?: number | null
      networkingPerMonth?: number | null
      resetStartDate?: Date | null
    }
  }
}
