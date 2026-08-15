import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { getDuplicateProfiles } from "@/app/(dashboard)/settings/duplicate-profiles/actions"

const PHONE = "+63 917 555 1234"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "Event", "EventOccurrence", "EventRegistrant", "OccurrenceAttendee", "Volunteer", "VolunteerCommittee", "CommitteeRole", "Family", "FamilyMember" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

function member(firstName: string, lastName: string, extra: { phone?: string; email?: string } = {}) {
  return db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [], ...extra },
  })
}

function guest(firstName: string, lastName: string, extra: { phone?: string; email?: string } = {}) {
  return db.guest.create({ data: { firstName, lastName, language: [], ...extra } })
}

async function recordFor(id: string) {
  const result = await getDuplicateProfiles()
  expect(result.success).toBe(true)
  if (!result.success) throw new Error("unreachable")
  for (const group of result.data) {
    const found = group.records.find((r) => r.id === id)
    if (found) return found
  }
  throw new Error(`no duplicate group contained record ${id}`)
}

describe("duplicate profiles — authorization", () => {
  /**
   * `getDuplicateProfiles` is only ever called from a Super Admin page, but
   * `"use server"` makes it an endpoint regardless of who renders the caller.
   * What it returns is every candidate's DGroup, satellite, led groups,
   * volunteer roles, household links and activity dates — a bulk read of the
   * directory if it answers an unauthenticated POST.
   */
  async function asRole(role: string | null) {
    const { auth } = await import("@/lib/auth")
    const mockedAuth = auth as unknown as { mockResolvedValueOnce: (v: unknown) => void }
    mockedAuth.mockResolvedValueOnce(
      role === null ? null : { user: { id: "u", role, permissions: [], eventAccess: [] } },
    )
  }

  it("refuses an unauthenticated caller", async () => {
    await member("Maria", "Santos", { phone: PHONE })
    await guest("Maria", "Santos", { phone: PHONE })

    await asRole(null)
    expect(await getDuplicateProfiles()).toEqual({ success: false, error: "Unauthorized" })
  })

  it("refuses a Staff caller — this is Super Admin data", async () => {
    await member("Maria", "Santos", { phone: PHONE })
    await guest("Maria", "Santos", { phone: PHONE })

    await asRole("Staff")
    expect(await getDuplicateProfiles()).toEqual({ success: false, error: "Unauthorized" })
  })

  it("still answers a Super Admin", async () => {
    await member("Maria", "Santos", { phone: PHONE })
    await guest("Maria", "Santos", { phone: PHONE })

    const result = await getDuplicateProfiles()
    expect(result.success).toBe(true)
    if (!result.success) throw new Error("unreachable")
    expect(result.data.length).toBeGreaterThan(0)
  })
})

describe("duplicate profiles — activity preview", () => {
  it("reports events, check-ins, led groups and volunteer roles on the live record", async () => {
    const m = await member("Maria", "Santos", { phone: PHONE })
    await guest("Maria", "Santos", { phone: PHONE })

    // A OneTime event the member attended — attendance lives on `attendedAt`.
    const oneTime = await db.event.create({
      data: {
        name: "Anniversary",
        type: "OneTime",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-01"),
      },
    })
    await db.eventRegistrant.create({
      data: { eventId: oneTime.id, memberId: m.id, attendedAt: new Date("2026-03-01") },
    })

    // A MultiDay event with three attended days — attendance lives in OccurrenceAttendee.
    const multiDay = await db.event.create({
      data: {
        name: "Camp",
        type: "MultiDay",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-04-03"),
      },
    })
    const campRegistrant = await db.eventRegistrant.create({
      data: { eventId: multiDay.id, memberId: m.id },
    })
    for (const day of ["2026-04-01", "2026-04-02", "2026-04-03"]) {
      const occ = await db.eventOccurrence.create({
        data: { eventId: multiDay.id, date: new Date(`${day}T00:00:00.000Z`) },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId: occ.id, registrantId: campRegistrant.id },
      })
    }

    // A DGroup she leads.
    await db.smallGroup.create({ data: { name: "Victory YA", leaderId: m.id } })

    // A volunteer sign-up.
    const committee = await db.volunteerCommittee.create({
      data: { name: "Logistics", eventId: oneTime.id },
    })
    const role = await db.committeeRole.create({
      data: { name: "Usher", committeeId: committee.id },
    })
    await db.volunteer.create({
      data: {
        memberId: m.id,
        eventId: oneTime.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
      },
    })

    const record = await recordFor(m.id)
    expect(record.activity.events).toBe(2)
    // 1 from `attendedAt` + 3 OccurrenceAttendee rows.
    expect(record.activity.checkIns).toBe(4)
    expect(record.activity.ledGroups).toBe(1)
    expect(record.activity.volunteerRoles).toBe(1)
  })

  it("reports zeroes for the stray record sharing the phone", async () => {
    const m = await member("Maria", "Santos", { phone: PHONE })
    const g = await guest("Maria", "Santos", { phone: PHONE })

    const event = await db.event.create({
      data: {
        name: "Anniversary",
        type: "OneTime",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-01"),
      },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: m.id } })

    const record = await recordFor(g.id)
    expect(record.activity.events).toBe(0)
    expect(record.activity.checkIns).toBe(0)
    expect(record.activity.ledGroups).toBe(0)
    expect(record.activity.volunteerRoles).toBe(0)
    expect(record.activity.familyLinks).toBe(0)
    expect(record.activity.groupName).toBeNull()
  })

  it("reports a member's DGroup by name and a guest's as a claim", async () => {
    const leader = await member("Leader", "One")
    const group = await db.smallGroup.create({ data: { name: "Victory YA", leaderId: leader.id } })

    const m = await db.member.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        phone: PHONE,
        dateJoined: new Date(),
        language: [],
        smallGroupId: group.id,
        groupStatus: "Member",
      },
    })
    const g = await db.guest.create({
      data: { firstName: "Maria", lastName: "Santos", phone: PHONE, language: [], claimedSmallGroupId: group.id },
    })

    const memberRecord = await recordFor(m.id)
    expect(memberRecord.activity.groupName).toBe("Victory YA")
    expect(memberRecord.activity.groupIsClaimed).toBe(false)

    const guestRecord = await recordFor(g.id)
    expect(guestRecord.activity.groupName).toBe("Victory YA")
    expect(guestRecord.activity.groupIsClaimed).toBe(true)
  })

  it("counts family links on both record types", async () => {
    const m = await member("Maria", "Santos", { phone: PHONE })
    const g = await guest("Maria", "Santos", { phone: PHONE })
    const family = await db.family.create({ data: { name: "Santos" } })
    await db.familyMember.create({ data: { familyId: family.id, memberId: m.id, role: "MotherWife" } })
    await db.familyMember.create({ data: { familyId: family.id, guestId: g.id, role: "Child" } })

    expect((await recordFor(m.id)).activity.familyLinks).toBe(1)
    expect((await recordFor(g.id)).activity.familyLinks).toBe(1)
  })

  it("surfaces a member's upward satellite when there is no local DGroup", async () => {
    const m = await db.member.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        phone: PHONE,
        dateJoined: new Date(),
        language: [],
        upwardSatellite: "CCF Ortigas",
      },
    })
    await guest("Maria", "Santos", { phone: PHONE })

    const record = await recordFor(m.id)
    expect(record.activity.groupName).toBeNull()
    expect(record.activity.satellite).toBe("CCF Ortigas")
  })

  // Edge case: an anonymous registrant carries neither FK. It belongs to no
  // profile and must not be folded into whichever branch is checked first.
  it("counts an anonymous registrant against neither record", async () => {
    const m = await member("Maria", "Santos", { phone: PHONE })
    const g = await guest("Maria", "Santos", { phone: PHONE })

    const event = await db.event.create({
      data: {
        name: "Anniversary",
        type: "OneTime",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-01"),
      },
    })
    await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Walk", lastName: "In", attendedAt: new Date() },
    })

    expect((await recordFor(m.id)).activity.events).toBe(0)
    expect((await recordFor(g.id)).activity.events).toBe(0)
  })

  it("sets lastActivityAt to the latest registration when it is newer than the profile edit", async () => {
    const m = await member("Maria", "Santos", { phone: PHONE })
    await guest("Maria", "Santos", { phone: PHONE })

    const event = await db.event.create({
      data: {
        name: "Anniversary",
        type: "OneTime",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-01"),
      },
    })
    const reg = await db.eventRegistrant.create({ data: { eventId: event.id, memberId: m.id } })
    const future = new Date(Date.now() + 60 * 60 * 1000)
    await db.$executeRaw`UPDATE "EventRegistrant" SET "createdAt" = ${future} WHERE "id" = ${reg.id}`

    const record = await recordFor(m.id)
    expect(record.activity.lastActivityAt).not.toBeNull()
    expect(new Date(record.activity.lastActivityAt!).getTime()).toBe(future.getTime())
  })

  // Regression: the activity hydration runs as a second pass over the groups the
  // detection queries produced. It must not change which groups are reported.
  it("returns the same groups it did before activity was attached", async () => {
    await member("Maria", "Santos", { phone: PHONE })
    await guest("Maria", "Santos", { phone: PHONE })
    await member("Juan", "Cruz", { email: "juan@example.com" })
    await guest("Juan", "Cruz", { email: "JUAN@example.com" })
    await guest("Ana", "Reyes")
    await guest("ana", "REYES")

    const result = await getDuplicateProfiles()
    expect(result.success).toBe(true)
    if (!result.success) throw new Error("unreachable")

    const byField = result.data.reduce<Record<string, number>>((acc, g) => {
      acc[g.field] = (acc[g.field] ?? 0) + 1
      return acc
    }, {})
    // Maria by phone, Juan by email, Ana by name. The Maria/Juan name matches are
    // suppressed because a contact group already covers the same pair.
    expect(byField).toEqual({ phone: 1, email: 1, name: 1 })
    for (const group of result.data) {
      expect(group.records).toHaveLength(2)
      for (const record of group.records) {
        expect(record.activity).toBeDefined()
        expect(record.activity.createdAt).toEqual(expect.any(String))
      }
    }
  })
})
