import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { Session } from "next-auth"

import { db } from "@/lib/db"
import {
  createClusterVolunteer,
  removeClusterVolunteerFromDay,
} from "@/app/(dashboard)/events/cluster-actions"
import { getClusterVolunteerPool } from "@/lib/clusters/aggregate"
import { getClusterVolunteersExport } from "@/app/(event)/cluster/[id]/volunteers/export-actions"

/**
 * Adding to and removing from a Collab day's serving team, from the day's own
 * Volunteers screen.
 *
 * The gap: the day's roster is `signUpClusterId`-scoped, and the only writer of
 * that stamp was the public volunteer form. A staffer filling a gap had to add
 * the volunteer in the ministry's event workspace and then watch them not appear
 * on the day — the row lands unstamped, which is exactly what
 * `volunteerIsOnClusterDay` refuses.
 *
 * Removal ships with it because it is the undo. On a Collab the day's list and
 * the ministry's roster are the same rows seen through the stamp, so without a
 * "remove from this day" the only correction for a mis-add was deleting the
 * Volunteer row — destroying a standing sign-up that predates the day.
 *
 * Layers: integration (both actions + the pool and export they feed), regression
 * (the reuse rule, and removal not deleting), edge case (a partner ministry's
 * committee, a non-Collab day, an event off the day, an unstamped row). Unit
 * coverage for the shared pieces is in `cluster-ministry-label` and
 * `cluster-volunteer-export-columns`; no e2e — it is a three-select form.
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
async function openDay(kind: "Parallel" | "Collab") {
  const cluster = await db.eventCluster.create({
    data: { name: "Youth × Singles Night", date: DAY, kind, isOpen: true },
    select: { id: true, publicToken: true },
  })
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

async function seedMember(firstName: string) {
  const member = await db.member.create({
    data: { firstName, lastName: "Cruz", dateJoined: new Date(), language: [] },
    select: { id: true },
  })
  return member.id
}

// ─── Adding ──────────────────────────────────────────────────────────────────

describe("adding a volunteer from the day's Volunteers screen", () => {
  it("files the sign-up under the chosen ministry's event, stamped with the day", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")

    const result = await createClusterVolunteer(day.id, {
      eventId: day.youth.eventId,
      memberId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "  door duty  ",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reused).toBe(false)
      // Labelled by ministry, not event name — the same indirection the form uses.
      expect(result.data.eventName).toBe("Youth")
    }

    const rows = await db.volunteer.findMany({ where: { memberId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].eventId).toBe(day.youth.eventId)
    expect(rows[0].signUpClusterId).toBe(day.id)
    expect(rows[0].status).toBe("Pending")
    expect(rows[0].notes).toBe("door duty")
    expect(rows[0].leaderApprovalToken).toBeTruthy()
  })

  it("puts them on the day's list, not just the standing roster", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")

    await createClusterVolunteer(day.id, {
      eventId: day.youth.eventId,
      memberId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })

    const pool = await getClusterVolunteerPool(admin, day.id, { scope: "day" })
    expect(pool.volunteers.map((v) => v.member.id)).toEqual([memberId])
    expect(pool.dayCount).toBe(1)
  })

  it("reuses a ministry regular's standing row instead of duplicating it", async () => {
    // The regression the per-event form can't clear: it refuses a second sign-up
    // outright, so an admin adding a weekly volunteer to the day got an error.
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")
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

    const result = await createClusterVolunteer(day.id, {
      eventId: day.youth.eventId,
      memberId,
      committeeId: day.youth.committeeId,
      preferredRoleId: otherRole.id,
      notes: "on the door this week",
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.reused).toBe(true)

    const rows = await db.volunteer.findMany({ where: { memberId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(standing.id)
    expect(rows[0].signUpClusterId).toBe(day.id)
    expect(rows[0].preferredRoleId).toBe(otherRole.id)
    expect(rows[0].notes).toBe("on the door this week")
    // A confirmation already granted is not silently withdrawn.
    expect(rows[0].status).toBe("Confirmed")
  })

  it("refuses a second add of someone already on the day", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")
    const input = {
      eventId: day.youth.eventId,
      memberId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    }

    expect((await createClusterVolunteer(day.id, input)).success).toBe(true)
    const second = await createClusterVolunteer(day.id, input)

    expect(second.success).toBe(false)
    if (!second.success) expect(second.error).toMatch(/already on this day/i)
    expect(await db.volunteer.count({ where: { memberId } })).toBe(1)
  })

  it("refuses a committee belonging to the partner ministry", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")

    const result = await createClusterVolunteer(day.id, {
      eventId: day.youth.eventId,
      memberId,
      committeeId: day.singles.committeeId,
      preferredRoleId: day.singles.roleId,
      notes: "",
    })

    expect(result.success).toBe(false)
    expect(await db.volunteer.count()).toBe(0)
  })

  it("refuses an event that isn't on this day", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")
    const stranger = await db.event.create({
      data: { name: "Someone Else's Event", type: "OneTime", startDate: DAY, endDate: DAY },
      select: { id: true },
    })

    const result = await createClusterVolunteer(day.id, {
      eventId: stranger.id,
      memberId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })

    expect(result.success).toBe(false)
    expect(await db.volunteer.count()).toBe(0)
  })

  it("refuses on a Parallel day, which has no shared serving team", async () => {
    const day = await openDay("Parallel")
    const memberId = await seedMember("Maria")

    const result = await createClusterVolunteer(day.id, {
      eventId: day.youth.eventId,
      memberId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })

    expect(result.success).toBe(false)
    expect(await db.volunteer.count()).toBe(0)
  })

  it("refuses a missing member and an unset committee", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")

    const noMember = await createClusterVolunteer(day.id, {
      eventId: day.youth.eventId,
      memberId: "",
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })
    const noCommittee = await createClusterVolunteer(day.id, {
      eventId: day.youth.eventId,
      memberId,
      committeeId: "",
      preferredRoleId: "",
      notes: "",
    })

    expect(noMember.success).toBe(false)
    expect(noCommittee.success).toBe(false)
    expect(await db.volunteer.count()).toBe(0)
  })
})

// ─── Removing ────────────────────────────────────────────────────────────────

describe("removing a volunteer from the day", () => {
  it("clears the stamp and keeps the ministry's roster entry", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")
    const standing = await db.volunteer.create({
      data: {
        memberId,
        eventId: day.youth.eventId,
        committeeId: day.youth.committeeId,
        preferredRoleId: day.youth.roleId,
        status: "Confirmed",
        notes: "from the weekly roster",
        signUpClusterId: day.id,
      },
      select: { id: true },
    })

    const result = await removeClusterVolunteerFromDay(day.id, standing.id)
    expect(result.success).toBe(true)

    const row = await db.volunteer.findUnique({ where: { id: standing.id } })
    expect(row).not.toBeNull()
    expect(row?.signUpClusterId).toBeNull()
    // Removing someone from a date says nothing about how they serve.
    expect(row?.status).toBe("Confirmed")
    expect(row?.committeeId).toBe(day.youth.committeeId)
    expect(row?.notes).toBe("from the weekly roster")

    const pool = await getClusterVolunteerPool(admin, day.id, { scope: "day" })
    expect(pool.dayCount).toBe(0)
    // Still on the union — that is the whole point of not deleting them.
    expect(pool.allCount).toBe(1)
  })

  it("refuses a volunteer who was never on this day", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")
    const unstamped = await db.volunteer.create({
      data: {
        memberId,
        eventId: day.youth.eventId,
        committeeId: day.youth.committeeId,
        preferredRoleId: day.youth.roleId,
      },
      select: { id: true },
    })

    const result = await removeClusterVolunteerFromDay(day.id, unstamped.id)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/not on this day/i)
    const row = await db.volunteer.findUnique({ where: { id: unstamped.id } })
    expect(row).not.toBeNull()
  })

  it("lets the same person be added back afterwards", async () => {
    const day = await openDay("Collab")
    const memberId = await seedMember("Maria")
    const input = {
      eventId: day.youth.eventId,
      memberId,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    }

    const added = await createClusterVolunteer(day.id, input)
    expect(added.success).toBe(true)
    if (!added.success) return
    expect((await removeClusterVolunteerFromDay(day.id, added.data.id)).success).toBe(true)

    const readded = await createClusterVolunteer(day.id, input)
    expect(readded.success).toBe(true)
    if (readded.success) expect(readded.data.reused).toBe(true)
    expect(await db.volunteer.count({ where: { memberId } })).toBe(1)
  })
})

// ─── The export the screen offers ────────────────────────────────────────────

describe("the day's volunteer export", () => {
  it("describes the same list the screen's scope shows", async () => {
    const day = await openDay("Collab")
    const onDay = await seedMember("Maria")
    const standingOnly = await seedMember("Jon")
    await createClusterVolunteer(day.id, {
      eventId: day.youth.eventId,
      memberId: onDay,
      committeeId: day.youth.committeeId,
      preferredRoleId: day.youth.roleId,
      notes: "",
    })
    await db.volunteer.create({
      data: {
        memberId: standingOnly,
        eventId: day.singles.eventId,
        committeeId: day.singles.committeeId,
        preferredRoleId: day.singles.roleId,
      },
    })

    const dayExport = await getClusterVolunteersExport(day.id, "day")
    expect(dayExport.success).toBe(true)
    if (dayExport.success) {
      expect(dayExport.data.rows).toHaveLength(1)
      expect(dayExport.data.rows[0].firstName).toBe("Maria")
      // Ministry, not event name.
      expect(dayExport.data.rows[0].ministry).toBe("Youth")
    }

    const allExport = await getClusterVolunteersExport(day.id, "all")
    expect(allExport.success).toBe(true)
    if (allExport.success) {
      expect(allExport.data.rows.map((r) => r.ministry).sort()).toEqual([
        "Singles",
        "Youth",
      ])
    }
  })
})
