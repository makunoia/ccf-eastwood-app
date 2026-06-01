import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { verifyPreAuthToken } from "@/lib/auth-tokens"
import type { UserRole, FeatureArea, PermissionAction } from "@/app/generated/prisma/client"
import type { UserPermissionEntry } from "@/types/next-auth"

function groupPermissions(
  rows: { feature: FeatureArea; action: PermissionAction }[]
): UserPermissionEntry[] {
  const map = new Map<FeatureArea, PermissionAction[]>()
  for (const { feature, action } of rows) {
    const existing = map.get(feature)
    if (existing) {
      existing.push(action)
    } else {
      map.set(feature, [action])
    }
  }
  return Array.from(map.entries()).map(([feature, actions]) => ({ feature, actions }))
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
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
              permissions: { select: { feature: true, action: true } },
              eventAccess: { select: { eventId: true } },
            },
          })
          if (!user) return null

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            username: user.username,
            role: user.role,
            totpEnabled: user.totpEnabled,
            mustChangePassword: user.mustChangePassword,
            requiresTotpSetup: user.requiresTotpSetup,
            permissions: groupPermissions(user.permissions),
            eventAccess: user.eventAccess.map((e) => e.eventId),
          }
        }

        // ── Step 1: username + password ──────────────────────────────────────
        if (!credentials?.username || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { username: (credentials.username as string).toLowerCase() },
          include: {
            permissions: { select: { feature: true, action: true } },
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
          username: user.username,
          role: user.role,
          totpEnabled: user.totpEnabled,
          mustChangePassword: user.mustChangePassword,
          requiresTotpSetup: user.requiresTotpSetup,
          permissions: groupPermissions(user.permissions),
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
        token.username = user.username ?? ""
        token.role = user.role ?? "Staff"
        token.permissions = user.permissions ?? []
        token.eventAccess = user.eventAccess ?? []
        token.totpEnabled = user.totpEnabled ?? false
        token.mustChangePassword = user.mustChangePassword ?? false
        token.requiresTotpSetup = user.requiresTotpSetup ?? false
      }

      // On explicit session update, refresh flags from DB
      if (trigger === "update" && token.id) {
        const fresh = await db.user.findUnique({
          where: { id: token.id as string },
          include: {
            permissions: { select: { feature: true, action: true } },
            eventAccess: { select: { eventId: true } },
          },
        })
        if (fresh) {
          token.username = fresh.username
          token.role = fresh.role
          token.permissions = groupPermissions(fresh.permissions)
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
        session.user.username = (token.username ?? "") as string
        session.user.role = token.role as UserRole
        session.user.permissions = (token.permissions ?? []) as UserPermissionEntry[]
        session.user.eventAccess = (token.eventAccess ?? []) as string[]
        session.user.totpEnabled = (token.totpEnabled ?? false) as boolean
        session.user.mustChangePassword = (token.mustChangePassword ?? false) as boolean
        session.user.requiresTotpSetup = (token.requiresTotpSetup ?? false) as boolean
      }
      return session
    },
  },
})
