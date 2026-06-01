import type { DefaultSession, DefaultJWT } from "next-auth"
import type { UserRole, FeatureArea, PermissionAction } from "@/app/generated/prisma/client"

export type UserPermissionEntry = {
  feature: FeatureArea
  actions: PermissionAction[]
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      username: string
      role: UserRole
      permissions: UserPermissionEntry[]
      eventAccess: string[]
      totpEnabled: boolean
      mustChangePassword: boolean
      requiresTotpSetup: boolean
    } & DefaultSession["user"]
  }

  interface User {
    username?: string
    role?: UserRole
    permissions?: UserPermissionEntry[]
    eventAccess?: string[]
    totpEnabled?: boolean
    mustChangePassword?: boolean
    requiresTotpSetup?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    username: string
    role: UserRole
    permissions: UserPermissionEntry[]
    eventAccess: string[]
    totpEnabled: boolean
    mustChangePassword: boolean
    requiresTotpSetup: boolean
  }
}
