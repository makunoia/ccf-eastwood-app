import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { getEventVolunteersExport } from "@/app/(event)/event/[id]/volunteers/export-actions"

/**
 * Export of an event's serving roster.
 *
 *  - integration: one row per Volunteer with the member's profile, committee,
 *                 roles and status resolved; the column offer follows the
 *                 event's modules and what the roster actually holds
 *  - edge case:   bus assignment, an unassigned role, a member with no DGroup
 *  - permissions: unauthenticated / no Export action / no access to the event
 *  - unit:        column model covered in tests/unit/event-volunteers-export
 *  - e2e:         skipped — the download is a Blob click over an action already
 *                 asserted here; the browser adds no new behaviour
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

const adminSession = {
  user: { id: "test-admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "BusPassenger", "Bus", "EventModule",
    "Volunteer", "CommitteeRole", "VolunteerCommittee",
    "Event", "Member", "LifeStage", "SmallGroup"
    RESTART IDENTITY CASCADE`
  vi.mocked(auth).mockResolvedValue(adminSession as never)
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedVolunteer(overrides: { memberData?: Record<string, unknown> } = {}) {
  const event = await db.event.create({
    data: {
      name: "Sunday Service",
      type: "OneTime",
      startDate: new Date("2026-08-02T00:00:00Z"),
      endDate: new Date("2026-08-02T00:00:00Z"),
    },
  })
  const member = await db.member.create({
    data: {
      firstName: "Maria",
      lastName: "Santos",
      phone: "+63 917 111 2222",
      email: "maria@example.com",
      dateJoined: new Date(),
      language: [],
      ...overrides.memberData,
    },
  })
  const committee = await db.volunteerCommittee.create({
    data: { name: "Ushering", eventId: event.id },
  })
  const role = await db.committeeRole.create({
    data: { name: "Greeter", committeeId: committee.id },
  })
  const volunteer = await db.volunteer.create({
    data: {
      memberId: member.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
  return { event, member, committee, role, volunteer }
}

describe("getEventVolunteersExport", () => {
  it("returns the serving record with the member's contact details", async () => {
    const { event } = await seedVolunteer()

    const result = await getEventVolunteersExport(event.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.rows).toHaveLength(1)
    expect(result.data.rows[0]).toMatchObject({
      firstName: "Maria",
      lastName: "Santos",
      email: "maria@example.com",
      phone: "+63 917 111 2222",
      committeeName: "Ushering",
      preferredRole: "Greeter",
      assignedRole: null,
      status: "Confirmed",
      bus: null,
    })
  })

  it("resolves the profile columns and offers them once populated", async () => {
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Pro", order: 1 } })
    const { event, member } = await seedVolunteer({
      memberData: { nickname: "Mars", birthMonth: 3, birthYear: 1994, lifeStageId: lifeStage.id },
    })
    const group = await db.smallGroup.create({
      data: { name: "Team Ignite", leaderId: member.id, language: [] },
    })
    await db.member.update({ where: { id: member.id }, data: { smallGroupId: group.id } })

    const result = await getEventVolunteersExport(event.id)
    if (!result.success) throw new Error(result.error)

    expect(result.data.rows[0]).toMatchObject({
      nickname: "Mars",
      lifeStage: "Young Pro",
      birthDate: "March 1994",
      smallGroup: "Team Ignite",
    })
    const keys = result.data.columns.map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(["nickname", "lifeStage", "birthDate", "smallGroup"]))
    // Never collected on this roster, so never offered.
    expect(keys).not.toContain("gender")
  })

  it("includes the bus assignment and offers the column when Embarkation is on", async () => {
    const { event, volunteer } = await seedVolunteer()
    await db.eventModule.create({ data: { eventId: event.id, type: "Embarkation" } })
    const bus = await db.bus.create({
      data: { eventId: event.id, name: "Bus A", direction: "Both" },
    })
    await db.busPassenger.create({ data: { busId: bus.id, volunteerId: volunteer.id } })

    const result = await getEventVolunteersExport(event.id)
    if (!result.success) throw new Error(result.error)

    expect(result.data.rows[0]).toMatchObject({ bus: "Bus A", busDirection: "Both" })
    expect(result.data.columns.find((c) => c.key === "bus")).toMatchObject({ collected: true })
  })

  it("never reaches into another event's roster", async () => {
    await seedVolunteer()
    const other = await db.event.create({
      data: {
        name: "Youth Night",
        type: "OneTime",
        startDate: new Date("2026-08-02T00:00:00Z"),
        endDate: new Date("2026-08-02T00:00:00Z"),
      },
    })

    const result = await getEventVolunteersExport(other.id)
    if (!result.success) throw new Error(result.error)
    expect(result.data.rows).toEqual([])
  })

  it("rejects unauthenticated callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await getEventVolunteersExport("any-event")).toEqual({
      success: false,
      error: "Not authenticated.",
    })
  })

  it("rejects a user without the Events export permission", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Write"] }],
        eventAccess: [],
      },
    } as never)

    expect(await getEventVolunteersExport("any-event")).toEqual({
      success: false,
      error: "Unauthorized.",
    })
  })

  it("rejects a user scoped away from this event", async () => {
    const { event } = await seedVolunteer()
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Export"] }],
        eventAccess: ["some-other-event"],
      },
    } as never)

    expect(await getEventVolunteersExport(event.id)).toEqual({
      success: false,
      error: "Unauthorized.",
    })
  })
})
