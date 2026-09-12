import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import type { McpActor } from "@/lib/mcp/auth"
import { promoteMcpGuest } from "@/lib/mcp/mutations"
import {
  resolveMcpDGroupRequest,
  setMcpEventAttendance,
  setMcpOccurrenceCheckinOpen,
  targetMcpDGroupRequest,
} from "@/lib/mcp/operations"

const admin: McpActor = {
  id: "mcp-admin",
  username: "mcp-admin",
  role: "SuperAdmin",
  scopes: new Set([
    "churchie:members:read",
    "churchie:members:write",
    "churchie:guests:read",
    "churchie:guests:write",
    "churchie:small-groups:read",
    "churchie:small-groups:write",
    "churchie:events:read",
    "churchie:events:write",
    "churchie:volunteers:read",
    "churchie:volunteers:write",
  ]),
  permissions: new Map(),
  eventAccess: new Set(),
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "User", "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "Event", "EventRegistrant", "EventOccurrence", "OccurrenceAttendee", "VolunteerCommittee", "CommitteeRole", "Volunteer" RESTART IDENTITY CASCADE`
  await db.user.create({ data: { id: admin.id, username: admin.username, role: "SuperAdmin" } })
})

afterAll(async () => {
  await db.$disconnect()
})

describe("MCP operational mutations", () => {
  it("records and clears session attendance only inside the specified event", async () => {
    const event = await db.event.create({
      data: { name: "Conference", type: "MultiDay", startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-10-02T00:00:00Z") },
    })
    const otherEvent = await db.event.create({
      data: { name: "Other", type: "MultiDay", startDate: new Date("2026-11-01T00:00:00Z"), endDate: new Date("2026-11-02T00:00:00Z") },
    })
    const member = await db.member.create({ data: { firstName: "Ana", lastName: "Santos", dateJoined: new Date(), language: [] } })
    const registrant = await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    const occurrence = await db.eventOccurrence.create({ data: { eventId: event.id, date: new Date("2026-10-01T08:00:00Z") } })
    const otherOccurrence = await db.eventOccurrence.create({ data: { eventId: otherEvent.id, date: new Date("2026-11-01T08:00:00Z") } })

    const mismatched = await setMcpEventAttendance(admin, {
      eventId: event.id,
      subjectKind: "registrant",
      subjectId: registrant.id,
      occurrenceId: otherOccurrence.id,
      attended: true,
    })
    expect(mismatched.success).toBe(false)

    const checkedIn = await setMcpEventAttendance(admin, {
      eventId: event.id,
      subjectKind: "registrant",
      subjectId: registrant.id,
      occurrenceId: occurrence.id,
      attended: true,
    })
    expect(checkedIn.success).toBe(true)
    expect(await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id, registrantId: registrant.id } })).toBe(1)

    const cleared = await setMcpEventAttendance(admin, {
      eventId: event.id,
      subjectKind: "registrant",
      subjectId: registrant.id,
      occurrenceId: occurrence.id,
      attended: false,
    })
    expect(cleared.success).toBe(true)
    expect(await db.occurrenceAttendee.count({ where: { occurrenceId: occurrence.id, registrantId: registrant.id } })).toBe(0)
  })

  it("enforces a Staff user's event boundary before changing attendance", async () => {
    const event = await db.event.create({ data: { name: "Allowed", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const otherEvent = await db.event.create({ data: { name: "Denied", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    const member = await db.member.create({ data: { firstName: "Ben", lastName: "Cruz", dateJoined: new Date(), language: [] } })
    const registrant = await db.eventRegistrant.create({ data: { eventId: otherEvent.id, memberId: member.id } })
    const staff: McpActor = {
      ...admin,
      role: "Staff",
      permissions: new Map([["Events", new Set(["Write"])]]),
      eventAccess: new Set([event.id]),
    }

    const result = await setMcpEventAttendance(staff, {
      eventId: otherEvent.id,
      subjectKind: "registrant",
      subjectId: registrant.id,
      attended: true,
    })
    expect(result).toEqual({ success: false, error: "You do not have write access to this event." })
    expect((await db.eventRegistrant.findUniqueOrThrow({ where: { id: registrant.id } })).attendedAt).toBeNull()
  })

  it("opens a session and synchronizes the pinned walk-in target", async () => {
    const event = await db.event.create({ data: { name: "Weekly", type: "Recurring", startDate: new Date(), endDate: new Date(), walkInSessionMode: "Pinned" } })
    const occurrence = await db.eventOccurrence.create({ data: { eventId: event.id, date: new Date("2026-10-04T08:00:00Z") } })

    expect((await setMcpOccurrenceCheckinOpen(admin, occurrence.id, true)).success).toBe(true)
    expect(await db.eventOccurrence.findUnique({ where: { id: occurrence.id }, select: { isOpen: true } })).toEqual({ isOpen: true })
    expect((await db.event.findUniqueOrThrow({ where: { id: event.id } })).walkInOccurrenceId).toBe(occurrence.id)

    expect((await setMcpOccurrenceCheckinOpen(admin, occurrence.id, false)).success).toBe(true)
    expect((await db.event.findUniqueOrThrow({ where: { id: event.id } })).walkInOccurrenceId).toBeNull()
  })

  it("approves a DGroup guest request through shared promotion and audit rules", async () => {
    const leader = await db.member.create({ data: { firstName: "Lea", lastName: "Leader", dateJoined: new Date(), language: [] } })
    const group = await db.smallGroup.create({ data: { name: "Tuesday DGroup", leaderId: leader.id, status: "Pending", language: [] } })
    const guest = await db.guest.create({ data: { firstName: "Gia", lastName: "Guest", language: [] } })
    const request = await db.smallGroupMemberRequest.create({ data: { smallGroupId: group.id, guestId: guest.id, assignedByUserId: admin.id } })

    const result = await resolveMcpDGroupRequest(admin, request.id, "approve")
    expect(result.success).toBe(true)
    const promoted = await db.guest.findUniqueOrThrow({ where: { id: guest.id }, include: { member: true } })
    expect(promoted.member?.smallGroupId).toBe(group.id)
    expect((await db.smallGroup.findUniqueOrThrow({ where: { id: group.id } })).status).toBe("Active")
    expect(await db.smallGroupLog.count({ where: { smallGroupId: group.id, performedByUserId: admin.id } })).toBeGreaterThan(0)
  })

  it("targets an unassigned registration intent before approval", async () => {
    const leader = await db.member.create({ data: { firstName: "Lio", lastName: "Leader", dateJoined: new Date(), language: [] } })
    const group = await db.smallGroup.create({ data: { name: "Friday DGroup", leaderId: leader.id, language: [] } })
    const guest = await db.guest.create({ data: { firstName: "Sam", lastName: "Seeker", language: [] } })
    const request = await db.smallGroupMemberRequest.create({
      data: { guestId: guest.id, origin: "RegistrationIntent", status: "Pending" },
    })

    const targeted = await targetMcpDGroupRequest(admin, request.id, group.id)
    expect(targeted.success).toBe(true)
    expect(await db.smallGroupMemberRequest.findUnique({ where: { id: request.id }, select: { smallGroupId: true } })).toEqual({ smallGroupId: group.id })
    expect(await db.smallGroupLog.count({ where: { smallGroupId: group.id, action: "TempAssignmentCreated" } })).toBe(1)
  })

  it("does not let a Guest/Member admin place a promotion without DGroup write access", async () => {
    const leader = await db.member.create({ data: { firstName: "Lee", lastName: "Leader", dateJoined: new Date(), language: [] } })
    const group = await db.smallGroup.create({ data: { name: "Protected DGroup", leaderId: leader.id, language: [] } })
    const guest = await db.guest.create({ data: { firstName: "Gus", lastName: "Guest", language: [] } })
    const staff: McpActor = {
      ...admin,
      role: "Staff",
      permissions: new Map([
        ["Members", new Set(["Write"])],
        ["Guests", new Set(["Write"])],
      ]),
      scopes: new Set([
        "churchie:members:read",
        "churchie:members:write",
        "churchie:guests:read",
        "churchie:guests:write",
      ]),
    }

    const result = await promoteMcpGuest(staff, guest.id, {
      dateJoined: "2026-10-01",
      groupId: group.id,
    })
    expect(result).toEqual({ success: false, error: "You need DGroup write permission to place the promoted guest in a DGroup." })
    expect((await db.guest.findUniqueOrThrow({ where: { id: guest.id } })).memberId).toBeNull()
  })
})
