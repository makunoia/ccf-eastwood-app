import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { Session } from "next-auth"

import { db } from "@/lib/db"
import { submitClusterVolunteerSignUp } from "@/app/(dashboard)/events/cluster-actions"
import {
  getAccessibleClusterEvents,
  getClusterDayRows,
  getClusterOverview,
  getClusterRegistrationExportRows,
  getClusterVolunteerPool,
} from "@/lib/clusters/aggregate"

/**
 * Volunteer sign-ups for an event day.
 *
 * The reported gap: a collab day could not track its serving team. Volunteers
 * only ever signed up on an individual event, and the per-event form refuses a
 * second sign-up outright — so a ministry regular who already served the weekly
 * event had no way to say they were serving *this day*, and the cluster's
 * Volunteers screen could only show the union of both standing rosters. That
 * list answers "who has ever volunteered here", never "who is serving today".
 *
 * The day now has its own form, and `signUpClusterId` records that a sign-up
 * came through it — the exact mirror of `registrationClusterId` on the attendee
 * side, including the reuse rule for someone who already holds a row.
 *
 * Layers: integration (the action + the pool it feeds), regression (the standing
 * row no longer blocks the day), edge case (closed form, wrong kind, a partner
 * ministry's committee, a repeat submission). No unit layer — the logic is all
 * DB state; no e2e — the form is the existing volunteer form plus one select.
 */

const admin = {
  user: { id: "admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

const DAY = new Date("2026-09-05T00:00:00.000Z")

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence",
    "Volunteer", "CommitteeRole", "VolunteerCommittee",
    "EventRegistrant", "EventFormConfig", "EventClusterEvent", "EventCluster",
    "BreakoutGroupMember", "BreakoutGroup", "EventModule", "EventMinistry",
    "Ministry", "Event", "Member", "Guest", "LifeStage"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

/** Two ministries, each with its own event, committee and role, sharing one day. */
async function openDay(kind: "Parallel" | "Collab", volunteerIsOpen = true) {
  const cluster = await db.eventCluster.create({
    data: { name: "Youth × Singles Night", date: DAY, kind, volunteerIsOpen },
    select: { id: true, publicToken: true },
  })
  // Seeded one half after the other rather than in parallel: these are writes to
  // a shared test database, and two interleaved set-ups of the same day is a race
  // the test would be blamed for.
  const halves: { eventId: string; committeeId: string; roleId: string }[] = []
  const config = [
    { ministryName: "Youth", eventName: "Youth Night", committeeName: "Youth Ushering" },
    {
      ministryName: "Singles",
      eventName: "Singles Connect",
      committeeName: "Singles Ushering",
    },
  ]
  for (const [order, half] of config.entries()) {
    const ministry = await db.ministry.create({
      data: { name: half.ministryName },
      select: { id: true },
    })
    const event = await db.event.create({
      data: { name: half.eventName, type: "Recurring", startDate: DAY, endDate: DAY },
      select: { id: true },
    })
    await db.eventMinistry.create({ data: { eventId: event.id, ministryId: ministry.id } })
    await db.eventClusterEvent.create({
      data: { clusterId: cluster.id, eventId: event.id, order },
    })
    const committee = await db.volunteerCommittee.create({
      data: { name: half.committeeName, eventId: event.id },
      select: { id: true },
    })
    const role = await db.committeeRole.create({
      data: { name: "Greeter", committeeId: committee.id },
      select: { id: true },
    })
    halves.push({ eventId: event.id, committeeId: committee.id, roleId: role.id })
  }
  return { ...cluster, youth: halves[0], singles: halves[1] }
}

async function seedMember(firstName: string, phone: string) {
  const member = await db.member.create({
    data: { firstName, lastName: "Cruz", dateJoined: new Date(), language: [], phone },
    select: { id: true },
  })
  return member.id
}

// ─── The sign-up itself ──────────────────────────────────────────────────────

describe("signing up to serve on an event day", () => {
  it("files the sign-up under the chosen ministry's event, stamped with the day", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")

    const result = await submitClusterVolunteerSignUp(day.publicToken, {
      memberId,
      eventId: day.youth.eventId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "  happy to help  ",
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.reused).toBe(false)

    const rows = await db.volunteer.findMany({ where: { memberId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].eventId).toBe(day.youth.eventId)
    expect(rows[0].signUpClusterId).toBe(day.id)
    expect(rows[0].status).toBe("Pending")
    expect(rows[0].notes).toBe("happy to help")
    // Every sign-up gets its leader-approval link, however it arrived.
    expect(rows[0].leaderApprovalToken).toBeTruthy()
  })

  it("lets a ministry regular sign up for the day on top of their standing row", async () => {
    // The regression: the per-event form answers this with "You're already
    // registered as a volunteer for this event", which left the day blind to
    // everyone who serves the weekly event.
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")
    const standing = await db.volunteer.create({
      data: {
        memberId,
        eventId: day.youth.eventId,
        committeeId: day.youth.committeeId,
        preferredRoleId: day.youth.roleId,
        status: "Confirmed",
        notes: "from the weekly roster",
      },
      select: { id: true },
    })
    const otherRole = await db.committeeRole.create({
      data: { name: "Registration", committeeId: day.youth.committeeId },
      select: { id: true },
    })

    const result = await submitClusterVolunteerSignUp(day.publicToken, {
      memberId,
      eventId: day.youth.eventId,
      committeeId: day.youth.committeeId,
      preferredRoleId: otherRole.id,
      notes: "on the door this time",
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.reused).toBe(true)

    // Reused, never duplicated — the same rule the attendee side follows.
    const rows = await db.volunteer.findMany({ where: { memberId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(standing.id)
    expect(rows[0].signUpClusterId).toBe(day.id)
    // The preferences just given are their answer for this day…
    expect(rows[0].preferredRoleId).toBe(otherRole.id)
    expect(rows[0].notes).toBe("on the door this time")
    // …but a confirmation an admin already gave is not silently withdrawn.
    expect(rows[0].status).toBe("Confirmed")
  })

  it("says so on a second submission for the same day", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")
    const input = {
      memberId,
      eventId: day.youth.eventId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    }

    expect((await submitClusterVolunteerSignUp(day.publicToken, input)).success).toBe(true)
    const second = await submitClusterVolunteerSignUp(day.publicToken, input)
    expect(second.success).toBe(false)
    if (!second.success) expect(second.error).toMatch(/already signed up/i)
    expect(await db.volunteer.count({ where: { memberId } })).toBe(1)
  })
})

// ─── Refusals ────────────────────────────────────────────────────────────────

describe("what the day's volunteer form refuses", () => {
  it("a sign-up while the form is closed", async () => {
    const day = await openDay("Collab", false)
    const memberId = await seedMember("Maria", "+63 917 111 2222")

    const result = await submitClusterVolunteerSignUp(day.publicToken, {
      memberId,
      eventId: day.youth.eventId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })

    expect(result.success).toBe(false)
    expect(await db.volunteer.count()).toBe(0)
  })

  it("a Parallel day, which has no shared serving team", async () => {
    const day = await openDay("Parallel")
    const memberId = await seedMember("Maria", "+63 917 111 2222")

    const result = await submitClusterVolunteerSignUp(day.publicToken, {
      memberId,
      eventId: day.youth.eventId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })

    expect(result.success).toBe(false)
    expect(await db.volunteer.count()).toBe(0)
  })

  it("a committee belonging to the partner ministry's event", async () => {
    // Only reachable by hand-building the payload — the form offers the chosen
    // ministry's committees alone — which is exactly why it is checked here.
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")

    const result = await submitClusterVolunteerSignUp(day.publicToken, {
      memberId,
      eventId: day.youth.eventId,
      committeeId: day.singles.committeeId,
      preferredRoleId: day.singles.roleId,
      notes: "",
    })

    expect(result.success).toBe(false)
    expect(await db.volunteer.count()).toBe(0)
  })

  it("an event that isn't part of the day", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")
    const outsider = await db.event.create({
      data: { name: "Somewhere else", type: "OneTime", startDate: DAY, endDate: DAY },
      select: { id: true },
    })

    const result = await submitClusterVolunteerSignUp(day.publicToken, {
      memberId,
      eventId: outsider.id,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })

    expect(result.success).toBe(false)
    expect(await db.volunteer.count()).toBe(0)
  })
})

// ─── What the workspace shows ────────────────────────────────────────────────

describe("the cluster's volunteer list", () => {
  it("defaults to the day's sign-ups and keeps the standing rosters one click away", async () => {
    const day = await openDay("Collab")
    const regular = await seedMember("Maria", "+63 917 111 2222")
    const newcomer = await seedMember("Josh", "+63 917 333 4444")
    // A standing roster row for the weekly event, made for something else.
    await db.volunteer.create({
      data: {
        memberId: regular,
        eventId: day.youth.eventId,
        committeeId: day.youth.committeeId,
        preferredRoleId: day.youth.roleId,
        status: "Confirmed",
      },
    })

    const empty = await getClusterVolunteerPool(admin, day.id)
    expect(empty.volunteers).toHaveLength(0)
    expect(empty.dayCount).toBe(0)
    expect(empty.allCount).toBe(1)

    await submitClusterVolunteerSignUp(day.publicToken, {
      memberId: newcomer,
      eventId: day.singles.eventId,
      committeeId: day.singles.committeeId,
      preferredRoleId: day.singles.roleId,
      notes: "",
    })

    const dayList = await getClusterVolunteerPool(admin, day.id)
    expect(dayList.volunteers.map((v) => v.member.id)).toEqual([newcomer])
    expect(dayList.dayCount).toBe(1)
    expect(dayList.allCount).toBe(2)

    const all = await getClusterVolunteerPool(admin, day.id, { scope: "all" })
    expect(all.volunteers.map((v) => v.member.id).sort()).toEqual([newcomer, regular].sort())
  })

  it("keeps the other filters working within the day's list", async () => {
    const day = await openDay("Collab")
    const maria = await seedMember("Maria", "+63 917 111 2222")
    const josh = await seedMember("Josh", "+63 917 333 4444")
    for (const memberId of [maria, josh]) {
      await submitClusterVolunteerSignUp(day.publicToken, {
        memberId,
        eventId: day.youth.eventId,
        committeeId: day.youth.committeeId,
        preferredRoleId: day.youth.roleId,
        notes: "",
      })
    }
    await db.volunteer.updateMany({
      where: { memberId: maria },
      data: { status: "Confirmed" },
    })

    const confirmed = await getClusterVolunteerPool(admin, day.id, { status: "Confirmed" })
    expect(confirmed.volunteers.map((v) => v.member.id)).toEqual([maria])

    const byName = await getClusterVolunteerPool(admin, day.id, { search: "Josh" })
    expect(byName.volunteers.map((v) => v.member.id)).toEqual([josh])

    const byCommittee = await getClusterVolunteerPool(admin, day.id, {
      committeeId: day.singles.committeeId,
    })
    expect(byCommittee.volunteers).toHaveLength(0)
  })
})

// ─── Volunteers count as the day's people ────────────────────────────────────

describe("a volunteer on the day's registrant surfaces", () => {
  it("appears on the day's list as a Volunteer, and counts toward it", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")

    const before = await getClusterOverview(admin, day.id)
    expect(before.totals.uniquePeople).toBe(0)

    await submitClusterVolunteerSignUp(day.publicToken, {
      memberId,
      eventId: day.youth.eventId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })

    const events = await getAccessibleClusterEvents(admin, day.id)
    const rows = await getClusterDayRows(events, {
      clusterId: day.id,
      date: DAY,
      kind: "Collab",
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("Volunteer")
    expect(rows[0].memberId).toBe(memberId)
    expect(rows[0].onClusterDay).toBe(true)

    const after = await getClusterOverview(admin, day.id)
    expect(after.totals.uniquePeople).toBe(1)
    // Counted apart from registrations: both are the day's people, but an admin
    // planning seats and an admin planning shifts need different figures.
    expect(after.totals.volunteers).toBe(1)
    expect(after.totals.registrations).toBe(0)
    const youth = after.eventStats.find((e) => e.eventId === day.youth.eventId)!
    expect(youth.volunteers).toBe(1)
    expect(youth.registered).toBe(0)
    expect(after.roster.rows[0].isVolunteer).toBe(true)
  })

  it("leaves a ministry's standing serving team off the day", async () => {
    // The same rule the registrant list follows, and for the same reason: a
    // Volunteer row from months ago says nothing about this day.
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")
    await db.volunteer.create({
      data: {
        memberId,
        eventId: day.youth.eventId,
        committeeId: day.youth.committeeId,
        preferredRoleId: day.youth.roleId,
        status: "Confirmed",
      },
    })

    const events = await getAccessibleClusterEvents(admin, day.id)
    expect(
      await getClusterDayRows(events, { clusterId: day.id, date: DAY, kind: "Collab" })
    ).toHaveLength(0)
  })

  it("counts a volunteer who checked in, however they signed up", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")
    const standing = await db.volunteer.create({
      data: {
        memberId,
        eventId: day.youth.eventId,
        committeeId: day.youth.committeeId,
        preferredRoleId: day.youth.roleId,
        status: "Confirmed",
      },
      select: { id: true },
    })
    // Attendance on the session this day stands for.
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: day.youth.eventId, date: DAY },
      select: { id: true },
    })
    await db.eventClusterEvent.update({
      where: { clusterId_eventId: { clusterId: day.id, eventId: day.youth.eventId } },
      data: { occurrenceId: occurrence.id },
    })
    await db.occurrenceAttendee.create({
      data: { occurrenceId: occurrence.id, volunteerId: standing.id },
    })

    const events = await getAccessibleClusterEvents(admin, day.id)
    const rows = await getClusterDayRows(events, {
      clusterId: day.id,
      date: DAY,
      kind: "Collab",
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("Volunteer")
    expect(rows[0].checkedIn).toBe(true)
  })

  it("exports with type Volunteer, and no registration-only answers", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria", "+63 917 111 2222")
    await submitClusterVolunteerSignUp(day.publicToken, {
      memberId,
      eventId: day.youth.eventId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })

    const rows = await getClusterRegistrationExportRows(admin, day.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("Volunteer")
    expect(rows[0].firstName).toBe("Maria")
    expect(rows[0].mobile).toBe("+63 917 111 2222")
    // They answered the volunteer form, not the registration one.
    expect(rows[0].dietary).toBeNull()
    expect(rows[0].breakoutGroup).toBeNull()
    expect(rows[0].isPaid).toBe(false)
  })
})
