/**
 * Edge-safe Auth.js config used by middleware for JWT verification.
 * Must NOT import Prisma, pg, or any Node.js-only modules.
 * The full server-side config (with PrismaAdapter and DB callbacks) lives in lib/auth.ts.
 */
import type { NextAuthConfig } from "next-auth"
import type { UserRole, FeatureArea } from "@/app/generated/prisma/client"

export const authConfig = {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    /**
     * In middleware, jwt() is NOT called on every request — the token is just decoded.
     * This callback only runs at sign-in/update time, but we include it here so that
     * the middleware NextAuth instance has the same token shape as the main instance.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!
        token.role = user.role ?? "Staff"
        token.permissions = user.permissions ?? []
        token.eventAccess = user.eventAccess ?? []
        token.totpEnabled = user.totpEnabled ?? false
        token.mustChangePassword = user.mustChangePassword ?? false
        token.requiresTotpSetup = user.requiresTotpSetup ?? false
      }
      return token
    },
    /**
     * Maps JWT token fields to session.user so middleware can read role/permissions.
     */
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
        session.user.permissions = (token.permissions ?? []) as FeatureArea[]
        session.user.eventAccess = (token.eventAccess ?? []) as string[]
        session.user.totpEnabled = (token.totpEnabled ?? false) as boolean
        session.user.mustChangePassword = (token.mustChangePassword ?? false) as boolean
        session.user.requiresTotpSetup = (token.requiresTotpSetup ?? false) as boolean
      }
      return session
    },
  },
} satisfies NextAuthConfig
