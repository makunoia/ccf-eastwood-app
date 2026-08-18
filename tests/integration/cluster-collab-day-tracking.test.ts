import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { Session } from "next-auth"

import { db } from "@/lib/db"
import { registerForCluster } from "@/app/(dashboard)/events/cluster-actions"
import {
  getClusterBreakoutPool,
  getClusterOverview,
  getClusterRegistrantRows,
  getClusterRegistrationExportRows,
  getAccessibleClusterEvents,
} from "@/lib/clusters/aggregate"

/**
 * A Collab day's registrant tracking starts at zero.
 *
 * The reported bug, from production: a collab built from two ministries'
 * existing events opened with both of their registrant lists already on it. The
 * write path had already been fixed to register a regular for the day rather
 * than short-circuit on their series row (see cluster-collab-fresh-list), but
 * every READ surface still showed those inherited rows — flagged "on the series"
 * rather than dropped. An admin tracking sign-ups for the day was therefore
 * reading a list they never built, and the breakout screen offered every regular
 * of either ministry as someone to seat.
 *
 * Layers: integration (the surfaces), regression (the inherited rows, pinned),
 * edge case (Parallel unchanged, check-in as evidence). The rule itself is unit
 * tested in tests/unit/cluster-day-scope. No e2e — these are server-computed
 * lists with no new interaction.
 */

const admin = {
  user: { id: "admin", role: "SuperAdmin", permissions: [], eventAccess: [] },
} as unknown as Session

const DAY = new Date("2026-09-05T00:00:00.000Z")
/** Months before the day: the shape of a standing series registration. */
const LONG_BEFORE = new Date("2026-01-04T02:00:00.000Z")

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence",
    "EventRegistrant", "EventFormConfig", "EventClusterEvent", "EventCluster",
    "BreakoutGroupMember", "BreakoutGroup", "EventModule", "EventMinistry",
    "Ministry", "Event", "Member", "Guest", "Volunteer", "VolunteerCommittee",
    "CommitteeRole", "LifeStage"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function openDay(kind: "Parallel" | "Collab", eventType: "Recurring" | "OneTime" = "Recurring") {
  const cluster = await db.eventCluster.create({
    data: { name: "Youth × Singles Night", date: DAY, kind, isOpen: true },
    select: { id: true, publicToken: true },
  })
  const events = await Promise.all(
    [
      ["Youth", "Youth Night"],
      ["Singles", "Singles Connect"],
    ].map(async ([ministryName, eventName], order) => {
      const ministry = await db.ministry.create({
        data: { name: ministryName },
        select: { id: true },
      })
      const event = await db.event.create({
        data: { name: eventName, type: eventType, startDate: DAY, endDate: DAY },
        select: { id: true },
      })
      await db.eventMinistry.create({
        data: { eventId: event.id, ministryId: ministry.id },
      })
      await db.eventClusterEvent.create({
        data: { clusterId: cluster.id, eventId: event.id, order },
      })
      return event.id
    })
  )
  return { ...cluster, youthId: events[0], singlesId: events[1] }
}

/** A ministry regular: on file, holding a row made long before this day existed. */
async function seedRegular(
  eventId: string,
  name: string,
  phone: string,
  createdAt = LONG_BEFORE
) {
  const member = await db.member.create({
    data: { firstName: name, lastName: "Cruz", dateJoined: new Date(), language: [], phone },
    select: { id: true },
  })
  const registrant = await db.eventRegistrant.create({
    data: { eventId, memberId: member.id, createdAt },
    select: { id: true },
  })
  return { memberId: member.id, registrantId: registrant.id }
}

async function dayRows(clusterId: string, date: Date | null, kind: "Parallel" | "Collab") {
  const events = await getAccessibleClusterEvents(admin, clusterId)
  return getClusterRegistrantRows(events, { clusterId, date, kind })
}

// ─── The reported bug ────────────────────────────────────────────────────────

describe("a Collab day's registrant list starts empty", () => {
  it("shows none of the member events' standing registrants", async () => {
    const day = await openDay("Collab")
    await seedRegular(day.youthId, "Maria", "+63 917 111 2222")
    await seedRegular(day.singlesId, "Josh", "+63 917 333 4444")

    expect(await dayRows(day.id, DAY, "Collab")).toHaveLength(0)

    const overview = await getClusterOverview(admin, day.id)
    expect(overview.totals.registrations).toBe(0)
    expect(overview.totals.uniquePeople).toBe(0)
    // Not "0 on the day plus 2 on the series" — on a collab there is no third
    // state to report, because those rows are not part of the day at all.
    expect(overview.totals.seriesOnlyPeople).toBe(0)
    expect(overview.roster.rows).toHaveLength(0)
  })

  it("fills up only as people come through the day's form", async () => {
    const day = await openDay("Collab")
    const { memberId } = await seedRegular(day.youthId, "Maria", "+63 917 111 2222")
    await seedRegular(day.singlesId, "Josh", "+63 917 333 4444")

    const result = await registerForCluster(
      day.publicToken,
      { firstName: "Maria", lastName: "Cruz", mobileNumber: "0917 111 2222" },
      memberId,
      null,
      undefined,
      [day.youthId]
    )
    expect(result.success).toBe(true)

    const rows = await dayRows(day.id, DAY, "Collab")
    expect(rows).toHaveLength(1)
    expect(rows[0].memberId).toBe(memberId)
    expect(rows[0].onClusterDay).toBe(true)

    const overview = await getClusterOverview(admin, day.id)
    expect(overview.totals.uniquePeople).toBe(1)
    expect(overview.totals.viaSharedLinkPeople).toBe(1)
    // The series total is still reported per event, so the standing roster stays
    // visible as what it is: context, not the day's list.
    const youth = overview.eventStats.find((e) => e.eventId === day.youthId)!
    expect(youth.registered).toBe(1)
    expect(youth.seriesRegistered).toBe(1)
    const singles = overview.eventStats.find((e) => e.eventId === day.singlesId)!
    expect(singles.registered).toBe(0)
    expect(singles.seriesRegistered).toBe(1)
  })

  it("drops a OneTime member event's pre-existing registrations too", async () => {
    // The event was real before the day was built around it, so its list is
    // inherited in exactly the way a recurring event's is.
    const day = await openDay("Collab", "OneTime")
    await seedRegular(day.youthId, "Maria", "+63 917 111 2222")

    expect(await dayRows(day.id, DAY, "Collab")).toHaveLength(0)
  })

  it("counts someone who checked in, whether or not they signed up on the day", async () => {
    const day = await openDay("Collab", "OneTime")
    const { registrantId } = await seedRegular(day.youthId, "Maria", "+63 917 111 2222")
    await db.eventRegistrant.update({
      where: { id: registrantId },
      data: { attendedAt: new Date("2026-09-05T02:00:00.000Z") },
    })

    const rows = await dayRows(day.id, DAY, "Collab")
    expect(rows).toHaveLength(1)
    expect(rows[0].checkedIn).toBe(true)
  })

  it("keeps a Parallel day's series rows on the list, flagged", async () => {
    const day = await openDay("Parallel")
    await seedRegular(day.youthId, "Maria", "+63 917 111 2222")

    const rows = await dayRows(day.id, DAY, "Parallel")
    expect(rows).toHaveLength(1)
    expect(rows[0].onClusterDay).toBe(false)

    const overview = await getClusterOverview(admin, day.id)
    expect(overview.totals.seriesOnlyPeople).toBe(1)
  })
})

// ─── The export describes the same day ───────────────────────────────────────

describe("the day's export", () => {
  it("carries the day's people only on a Collab", async () => {
    const day = await openDay("Collab")
    const { memberId } = await seedRegular(day.youthId, "Maria", "+63 917 111 2222")
    await seedRegular(day.singlesId, "Josh", "+63 917 333 4444")

    expect(await getClusterRegistrationExportRows(admin, day.id)).toHaveLength(0)

    await registerForCluster(
      day.publicToken,
      { firstName: "Maria", lastName: "Cruz", mobileNumber: "0917 111 2222" },
      memberId,
      null,
      undefined,
      [day.youthId]
    )

    const rows = await getClusterRegistrationExportRows(admin, day.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].firstName).toBe("Maria")
    expect(rows[0].viaSharedForm).toBe(true)
  })

  it("still carries a Parallel day's series rows, marked as such", async () => {
    const day = await openDay("Parallel")
    await seedRegular(day.youthId, "Maria", "+63 917 111 2222")

    const rows = await getClusterRegistrationExportRows(admin, day.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].perEvent[day.youthId]).toBe("SeriesOnly")
  })
})

// ─── Seating the day's tables ────────────────────────────────────────────────

describe("the day's breakout candidate pool", () => {
  it("counts the day's people, not both ministries' series", async () => {
    const day = await openDay("Collab")
    const { memberId } = await seedRegular(day.youthId, "Maria", "+63 917 111 2222")
    await seedRegular(day.singlesId, "Josh", "+63 917 333 4444")
    await db.eventModule.createMany({
      data: [
        { eventId: day.youthId, type: "Breakout" },
        { eventId: day.singlesId, type: "Breakout" },
      ],
    })

    const before = await getClusterBreakoutPool(admin, day.id)
    expect(before.totalPeople).toBe(0)
    expect(before.unseatedPeople).toBe(0)

    await registerForCluster(
      day.publicToken,
      { firstName: "Maria", lastName: "Cruz", mobileNumber: "0917 111 2222" },
      memberId,
      null,
      undefined,
      [day.youthId]
    )

    const after = await getClusterBreakoutPool(admin, day.id)
    expect(after.totalPeople).toBe(1)
    // No tables exist yet, so the day's one person is waiting for a seat.
    expect(after.unseatedPeople).toBe(1)
  })
})
