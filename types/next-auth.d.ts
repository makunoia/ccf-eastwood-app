import type { DefaultSession, DefaultJWT } from "next-auth"
import type { UserRole, FeatureArea } from "@/app/generated/prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
      permissions: FeatureArea[]
      eventAccess: string[]
      totpEnabled: boolean
      mustChangePassword: boolean
      requiresTotpSetup: boolean
    } & DefaultSession["user"]
  }

  interface User {
    role?: UserRole
    permissions?: FeatureArea[]
    eventAccess?: string[]
    totpEnabled?: boolean
    mustChangePassword?: boolean
    requiresTotpSetup?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    role: UserRole
    permissions: FeatureArea[]
    eventAccess: string[]
    totpEnabled: boolean
    mustChangePassword: boolean
    requiresTotpSetup: boolean
  }
}
