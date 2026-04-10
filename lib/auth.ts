import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { verifyPreAuthToken } from "@/lib/auth-tokens"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        preAuthToken: { label: "Pre-auth Token", type: "text" },
      },
      async authorize(credentials) {
        // ── Step 2: TOTP second-step via pre-auth token ──────────────────────
        if (credentials?.preAuthToken) {
          const userId = verifyPreAuthToken(credentials.preAuthToken as string)
          if (!userId) return null

          const user = await db.user.findUnique({
            where: { id: userId },
            include: {
              permissions: { select: { feature: true } },
              eventAccess: { select: { eventId: true } },
            },
          })
          if (!user) return null

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            totpEnabled: user.totpEnabled,
            mustChangePassword: user.mustChangePassword,
            requiresTotpSetup: user.requiresTotpSetup,
            permissions: user.permissions.map((p) => p.feature),
            eventAccess: user.eventAccess.map((e) => e.eventId),
          }
        }

        // ── Step 1: email + password ─────────────────────────────────────────
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            permissions: { select: { feature: true } },
            eventAccess: { select: { eventId: true } },
          },
        })

        if (!user || !user.password) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!isValid) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          totpEnabled: user.totpEnabled,
          mustChangePassword: user.mustChangePassword,
          requiresTotpSetup: user.requiresTotpSetup,
          permissions: user.permissions.map((p) => p.feature),
          eventAccess: user.eventAccess.map((e) => e.eventId),
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // On sign-in, embed user data into the token
      if (user) {
        token.id = user.id!
        token.role = (user as any).role ?? "Staff"
        token.permissions = (user as any).permissions ?? []
        token.eventAccess = (user as any).eventAccess ?? []
        token.totpEnabled = (user as any).totpEnabled ?? false
        token.mustChangePassword = (user as any).mustChangePassword ?? false
        token.requiresTotpSetup = (user as any).requiresTotpSetup ?? false
      }

      // On explicit session update, refresh flags from DB
      if (trigger === "update" && token.id) {
        const fresh = await db.user.findUnique({
          where: { id: token.id as string },
          include: {
            permissions: { select: { feature: true } },
            eventAccess: { select: { eventId: true } },
          },
        })
        if (fresh) {
          token.role = fresh.role
          token.permissions = fresh.permissions.map((p) => p.feature)
          token.eventAccess = fresh.eventAccess.map((e) => e.eventId)
          token.totpEnabled = fresh.totpEnabled
          token.mustChangePassword = fresh.mustChangePassword
          token.requiresTotpSetup = fresh.requiresTotpSetup
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as any
        session.user.permissions = (token.permissions ?? []) as any
        session.user.eventAccess = (token.eventAccess ?? []) as string[]
        session.user.totpEnabled = (token.totpEnabled ?? false) as boolean
        session.user.mustChangePassword = (token.mustChangePassword ?? false) as boolean
        session.user.requiresTotpSetup = (token.requiresTotpSetup ?? false) as boolean
      }
      return session
    },
  },
})
