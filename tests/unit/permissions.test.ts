import { describe, it, expect } from "vitest"
import { isSuperAdmin, hasFeatureAccess, canAccessEvent } from "@/lib/permissions"
import type { Session } from "next-auth"
import type { FeatureArea } from "@/app/generated/prisma/client"

function makeSession(opts: {
  role?: "SuperAdmin" | "Staff"
  permissions?: FeatureArea[]
  eventAccess?: string[]
}): Session {
  return {
    user: {
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      image: null,
      role: opts.role ?? "Staff",
      permissions: opts.permissions ?? [],
      eventAccess: opts.eventAccess ?? [],
      totpEnabled: false,
      mustChangePassword: false,
      requiresTotpSetup: false,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  }
}

describe("isSuperAdmin", () => {
  it("returns true for a SuperAdmin session", () => {
    expect(isSuperAdmin(makeSession({ role: "SuperAdmin" }))).toBe(true)
  })

  it("returns false for a Staff session", () => {
    expect(isSuperAdmin(makeSession({ role: "Staff" }))).toBe(false)
  })

  it("returns false for null", () => {
    expect(isSuperAdmin(null)).toBe(false)
  })
})

describe("hasFeatureAccess", () => {
  it("SuperAdmin always has access regardless of permissions list", () => {
    const session = makeSession({ role: "SuperAdmin", permissions: [] })
    for (const area of ["Members", "Guests", "SmallGroups", "Ministries", "Events", "Volunteers"] as FeatureArea[]) {
      expect(hasFeatureAccess(session, area)).toBe(true)
    }
  })

  it("Staff with the matching permission has access", () => {
    const session = makeSession({ role: "Staff", permissions: ["Members"] })
    expect(hasFeatureAccess(session, "Members")).toBe(true)
  })

  it("Staff without the matching permission is denied", () => {
    const session = makeSession({ role: "Staff", permissions: ["Guests"] })
    expect(hasFeatureAccess(session, "Members")).toBe(false)
  })

  it("Staff with empty permissions list is denied everything", () => {
    const session = makeSession({ role: "Staff", permissions: [] })
    for (const area of ["Members", "Guests", "Events"] as FeatureArea[]) {
      expect(hasFeatureAccess(session, area)).toBe(false)
    }
  })

  it("returns false for a null session", () => {
    expect(hasFeatureAccess(null, "Events")).toBe(false)
  })
})

describe("canAccessEvent", () => {
  it("SuperAdmin can access any event", () => {
    const session = makeSession({ role: "SuperAdmin" })
    expect(canAccessEvent(session, "event-xyz")).toBe(true)
  })

  it("Staff with Events permission and no event restrictions can access any event", () => {
    const session = makeSession({ role: "Staff", permissions: ["Events"], eventAccess: [] })
    expect(canAccessEvent(session, "event-any")).toBe(true)
  })

  it("Staff with Events permission and a restricted list can access listed events", () => {
    const session = makeSession({
      role: "Staff",
      permissions: ["Events"],
      eventAccess: ["event-allowed"],
    })
    expect(canAccessEvent(session, "event-allowed")).toBe(true)
  })

  it("Staff with Events permission and a restricted list cannot access unlisted events", () => {
    const session = makeSession({
      role: "Staff",
      permissions: ["Events"],
      eventAccess: ["event-allowed"],
    })
    expect(canAccessEvent(session, "event-other")).toBe(false)
  })

  it("Staff without Events permission cannot access any event", () => {
    const session = makeSession({ role: "Staff", permissions: ["Members"], eventAccess: [] })
    expect(canAccessEvent(session, "event-any")).toBe(false)
  })

  it("returns false for a null session", () => {
    expect(canAccessEvent(null, "event-any")).toBe(false)
  })
})
