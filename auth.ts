import "next-auth/jwt"
import { prisma } from "@/db"

import NextAuth from "next-auth"
import authConfig from "./auth.config"
 
import { PrismaAdapter } from "@auth/prisma-adapter"
 
 
export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
  callbacks: { 
    async redirect({ url, baseUrl }) {
      // Handle relative paths - allow them to pass through
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`
      }
      // Handle full URLs within baseUrl
      if (url.startsWith(baseUrl)) {
        return url
      }
      
      // Default fallback to homepage
      return baseUrl
    },
   
    async session({ session, user }) {
      // Fetch the user from the database to include all fields
      const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
      })

      if (dbUser) {
        session.user = {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email ?? undefined,
          emailVerified: dbUser.emailVerified ?? null,
          image: dbUser.image,
          onboardingProgress: dbUser.onboardingProgress,
          targetOfferDate: dbUser.targetOfferDate,
          appsWithOutreachPerWeek: dbUser.appsWithOutreachPerWeek,
          networkingPerMonth: dbUser.networkingPerMonth,
          resetStartDate: dbUser.resetStartDate,
        } as typeof session.user
      }

      return session
    },
  }
})
