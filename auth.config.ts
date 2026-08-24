import EmailProvider from "next-auth/providers/nodemailer"
import GitHub from "next-auth/providers/github"
import type { NextAuthConfig } from "next-auth"

export default {
  providers: [
    GitHub({
      id: "github",
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      issuer: "https://github.com/login/oauth",
    }),
    EmailProvider({
      id: "email",
      name: "email",
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM
    })
  ],
  theme: {
    colorScheme: "dark",
    brandColor: "#007ACC", // electric-blue
    buttonText: "#ffffff", // white text on buttons
    // logo: "/logo.png", // Optional: add your logo URL here if you have one
  }
} satisfies NextAuthConfig
