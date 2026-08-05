import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  getClusterFormCoverage,
  getClusterRegistrationExport,
  getClusterRegistrationExportRows,
} from "@/lib/clusters/aggregate"
import { getClusterRegistrationsExport } from "@/app/(event)/cluster/[id]/registrants/export-actions"

/**
 * Export of registrants for an Event Cluster.
 *
 *  - integration: one row per PERSON (never duplicated across the day's
 *                 events), with per-event participation driving the Yes/No
 *                 columns; every form answer resolved from Member → Guest →
 *                 the registrant's own fields, ordered by last/first name; the
 *                 column offer follows what the cluster's forms actually ask for
 *  - edge case:   dateless cluster, cluster with no events, walk-in with no FK,
 *                 check-in scoped to the cluster's day (OneTime vs occurrence),
 *                 the same person checked in to one event but not another
 *  - permissions: unauthenticated / no Export action / partial event access
 *  - unit:        column model and the person collapse covered in
 *                 tests/unit/cluster-registrations-export
 *  - e2e:         skipped — the download is a Blob click over an action already
 *                 asserted here; the browser adds no new behaviour
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

const adminSession = {
  user: {
    id: "test-admin",
    role: "SuperAdmin",
    permissions: [],
    eventAccess: [],
  },
} as unknown as Session

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence",
    "BreakoutGroupMember", "BreakoutGroup",
    "FamilyMember", "Family", "SchedulePreference",
    "EventRegistrant", "EventFormConfig", "EventClusterEvent", "EventCluster",
    "Event", "Guest", "Member", "LifeStage", "AgeRangeBucket", "SmallGroup"
    RESTART IDENTITY CASCADE`
  vi.mocked(auth).mockResolvedValue(adminSession as never)
})

afterAll(async () => {
  await db.$disconnect()
})

const CLUSTER_DATE = new Date("2026-08-02T00:00:00Z")

async function seedCluster(date: Date | null = CLUSTER_DATE) {
  return db.eventCluster.create({
    data: { name: "Sunday, Aug 2", date },
  })
}

async function seedEvent(
  clusterId: string,
  name: string,
  order: number,
  overrides: Record<string, unknown> = {}
) {
  const event = await db.event.create({
    data: {
      name,
      type: "OneTime",
      startDate: CLUSTER_DATE,
      endDate: CLUSTER_DATE,
      ...overrides,
    },
  })
  await db.eventClusterEvent.create({
    data: { clusterId, eventId: event.id, order },
  })
  return event
}

describe("getClusterRegistrationExportRows", () => {
  it("returns one row per person with names resolved from member, guest, or the registrant", async () => {
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0)
    const youth = await seedEvent(cluster.id, "Youth Night", 1)

    const member = await db.member.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        nickname: "Mars",
        email: "maria@example.com",
        phone: "+63 917 111 2222",
        dateJoined: new Date(),
        language: [],
      },
    })
    const guest = await db.guest.create({
      data: {
        firstName: "Pedro",
        lastName: "Reyes",
        email: "pedro@example.com",
        phone: "+63 917 333 4444",
        language: [],
      },
    })

    // The member is on BOTH events — two registration records, one person.
    await db.eventRegistrant.create({
      data: { eventId: service.id, memberId: member.id },
    })
    await db.eventRegistrant.create({
      data: { eventId: youth.id, memberId: member.id },
    })
    await db.eventRegistrant.create({
      data: {
        eventId: service.id,
        guestId: guest.id,
        registrationClusterId: cluster.id,
      },
    })
    // Walk-in — no member/guest FK, personal fields only.
    await db.eventRegistrant.create({
      data: {
        eventId: service.id,
        firstName: "Ana",
        lastName: "Lopez",
        nickname: "Anne",
        mobileNumber: "+63 917 555 6666",
      },
    })

    const rows = await getClusterRegistrationExportRows(adminSession, cluster.id)

    // Four registrations, three people — Maria is on both events but exports once.
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.lastName)).toEqual(["Lopez", "Reyes", "Santos"])

    expect(rows[2]).toMatchObject({
      firstName: "Maria",
      nickname: "Mars",
      email: "maria@example.com",
      mobile: "+63 917 111 2222",
      type: "Member",
      viaSharedForm: false,
      checkedIn: false,
      checkedInAt: null,
    })
    // The events she's on carry Yes; nobody has checked in yet.
    expect(rows[2].events).toEqual({
      [service.id]: { checkedIn: false },
      [youth.id]: { checkedIn: false },
    })
    expect(rows[1]).toMatchObject({
      firstName: "Pedro",
      email: "pedro@example.com",
      mobile: "+63 917 333 4444",
      type: "Guest",
      viaSharedForm: true,
    })
    // Only on Service — Youth Night is absent, which the CSV renders as "No".
    expect(Object.keys(rows[1].events)).toEqual([service.id])
    expect(rows[0]).toMatchObject({
      firstName: "Ana",
      nickname: "Anne",
      email: null,
      mobile: "+63 917 555 6666",
      type: "Guest",
    })
    expect(Object.keys(rows[0].events)).toEqual([service.id])
    expect(new Date(rows[0].registeredAt).getTime()).not.toBeNaN()
  })

  it("tracks check-in per event on the person's single row", async () => {
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0)
    const youth = await seedEvent(cluster.id, "Youth Night", 1)
    const member = await db.member.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        dateJoined: new Date(),
        language: [],
      },
    })
    const checkedInAt = new Date("2026-08-02T01:15:00Z")
    await db.eventRegistrant.create({
      data: { eventId: service.id, memberId: member.id, attendedAt: checkedInAt },
    })
    await db.eventRegistrant.create({
      data: { eventId: youth.id, memberId: member.id },
    })

    const rows = await getClusterRegistrationExportRows(adminSession, cluster.id)

    expect(rows).toHaveLength(1)
    expect(rows[0].events).toEqual({
      [service.id]: { checkedIn: true },
      [youth.id]: { checkedIn: false },
    })
    // The person-level roll-up says they turned up somewhere on the day.
    expect(rows[0].checkedIn).toBe(true)
    expect(rows[0].checkedInAt).toBe(checkedInAt.toISOString())
  })

  it("merges the values that are genuinely per-event across a person's registrations", async () => {
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0, { price: 50000 })
    const youth = await seedEvent(cluster.id, "Youth Night", 1, { price: 25000 })
    const guest = await db.guest.create({
      data: { firstName: "Pedro", lastName: "Reyes", language: [] },
    })

    for (const [event, table, ref] of [
      [service, "Table 4", "GC-0001"],
      [youth, "Table 9", "GC-0002"],
    ] as const) {
      const registrant = await db.eventRegistrant.create({
        data: {
          eventId: event.id,
          guestId: guest.id,
          isPaid: true,
          paymentReference: ref,
        },
      })
      const breakout = await db.breakoutGroup.create({
        data: { eventId: event.id, name: table },
      })
      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: breakout.id, registrantId: registrant.id },
      })
    }

    const rows = await getClusterRegistrationExportRows(adminSession, cluster.id)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      breakoutGroup: "Table 4; Table 9",
      isPaid: true,
      paymentReference: "GC-0001; GC-0002",
    })
  })

  it("edge case — two walk-ins with no FK stay separate people", async () => {
    // Without a member or guest to key on, each registration is its own person;
    // collapsing them by name would silently merge two different attendees.
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0)
    const youth = await seedEvent(cluster.id, "Youth Night", 1)
    for (const eventId of [service.id, youth.id]) {
      await db.eventRegistrant.create({
        data: { eventId, firstName: "Ana", lastName: "Lopez" },
      })
    }

    const rows = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => Object.keys(r.events))).toEqual([[service.id], [youth.id]])
  })

  it("resolves every form answer a registration can carry", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    const lifeStage = await db.lifeStage.create({
      data: { name: "Young Pro", order: 1 },
    })
    const bucket = await db.ageRangeBucket.create({
      data: { label: "25–34", minAge: 25, maxAge: 34, order: 1 },
    })
    const leader = await db.member.create({
      data: { firstName: "Leader", lastName: "One", dateJoined: new Date(), language: [] },
    })
    const smallGroup = await db.smallGroup.create({
      data: { name: "Eastwood DGroup", leaderId: leader.id },
    })

    const guest = await db.guest.create({
      data: {
        firstName: "Pedro",
        lastName: "Reyes",
        nickname: "Peter",
        email: "pedro@example.com",
        phone: "+63 917 333 4444",
        gender: "Male",
        birthMonth: 3,
        birthYear: 1994,
        lifeStageId: lifeStage.id,
        ageRangeBucketId: bucket.id,
        language: ["English", "Filipino"],
        workCity: "Makati",
        meetingPreference: "Hybrid",
        scheduleDayOfWeek: 3,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
        claimedSmallGroupId: smallGroup.id,
      },
    })
    const family = await db.family.create({ data: { name: "Reyes Family" } })
    await db.familyMember.create({
      data: { familyId: family.id, guestId: guest.id, role: "FatherHusband" },
    })

    const registrant = await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        guestId: guest.id,
        dietaryPreference: "Other",
        dietaryOther: "no shellfish",
      },
    })
    const breakout = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Table 4" },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: breakout.id, registrantId: registrant.id },
    })

    const [row] = await getClusterRegistrationExportRows(adminSession, cluster.id)

    expect(row).toMatchObject({
      nickname: "Peter",
      email: "pedro@example.com",
      mobile: "+63 917 333 4444",
      lifeStage: "Young Pro",
      birthDate: "March 1994",
      ageRange: "25–34",
      gender: "Male",
      language: "English, Filipino",
      meetingPreference: "Hybrid",
      schedule: "Wednesday, 19:00 – 21:00",
      workCity: "Makati",
      claimedSmallGroup: "Eastwood DGroup",
      breakoutGroup: "Table 4",
      household: "Reyes Family",
      dietary: "Other — no shellfish",
    })
  })

  it("reads a member's schedule from their schedule preferences", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    const member = await db.member.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        dateJoined: new Date(),
        language: [],
        schedulePreferences: {
          create: { dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" },
        },
      },
    })
    await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id },
    })

    const [row] = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(row.schedule).toBe("Saturday, 09:00 – 11:00")
  })

  it("prefers the per-event nickname over the one on the profile", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    const guest = await db.guest.create({
      data: { firstName: "Pedro", lastName: "Reyes", nickname: "Peter", language: [] },
    })
    await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id, nickname: "Pete" },
    })

    const [row] = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(row.nickname).toBe("Pete")
  })

  it("edge case — labels a guest who claimed a group at another satellite", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    const guest = await db.guest.create({
      data: {
        firstName: "Pedro",
        lastName: "Reyes",
        language: [],
        claimedSatellite: "Ortigas",
      },
    })
    await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const [row] = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(row.claimedSmallGroup).toBe("Ortigas (another satellite)")
  })

  it("carries payment state for paid events", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Retreat", 0, { price: 50000 })
    const guest = await db.guest.create({
      data: { firstName: "Pedro", lastName: "Reyes", language: [] },
    })
    await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        guestId: guest.id,
        isPaid: true,
        paymentReference: "GC-0001",
      },
    })

    const [row] = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(row).toMatchObject({ isPaid: true, paymentReference: "GC-0001" })
  })

  it("marks a OneTime registrant checked in from attendedAt", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    const attendedAt = new Date("2026-08-02T01:15:00Z")
    await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        firstName: "Ana",
        lastName: "Lopez",
        attendedAt,
      },
    })

    const [row] = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(row.checkedIn).toBe(true)
    expect(row.checkedInAt).toBe(attendedAt.toISOString())
  })

  it("edge case — session check-in counts only on the cluster's own day", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Elevate", 0, {
      type: "Recurring",
      endDate: new Date("2026-12-31T00:00:00Z"),
    })
    // Signed up through the day's link, so they're part of the day before they
    // arrive — otherwise day scoping would (correctly) leave them out entirely.
    const registrant = await db.eventRegistrant.create({
      data: {
        eventId: event.id,
        firstName: "Ana",
        lastName: "Lopez",
        registrationClusterId: cluster.id,
      },
    })

    const lastWeek = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-07-26T00:00:00Z") },
    })
    await db.occurrenceAttendee.create({
      data: { occurrenceId: lastWeek.id, registrantId: registrant.id },
    })

    const [before] = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(before.checkedIn).toBe(false)
    expect(before.checkedInAt).toBeNull()

    const today = await db.eventOccurrence.create({
      data: { eventId: event.id, date: CLUSTER_DATE },
    })
    const checkedInAt = new Date("2026-08-02T01:05:00Z")
    await db.occurrenceAttendee.create({
      data: { occurrenceId: today.id, registrantId: registrant.id, checkedInAt },
    })

    const [after] = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(after.checkedIn).toBe(true)
    expect(after.checkedInAt).toBe(checkedInAt.toISOString())
  })

  it("edge case — a dateless cluster keeps the unscoped check-in reading", async () => {
    const cluster = await seedCluster(null)
    const event = await seedEvent(cluster.id, "Elevate", 0, {
      type: "Recurring",
      endDate: new Date("2026-12-31T00:00:00Z"),
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Ana", lastName: "Lopez" },
    })
    const anyDay = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-07-26T00:00:00Z") },
    })
    await db.occurrenceAttendee.create({
      data: { occurrenceId: anyDay.id, registrantId: registrant.id },
    })

    const [row] = await getClusterRegistrationExportRows(adminSession, cluster.id)
    expect(row.checkedIn).toBe(true)
  })

  it("edge case — returns nothing for a cluster with no events, and for a missing cluster", async () => {
    const cluster = await seedCluster()
    expect(await getClusterRegistrationExportRows(adminSession, cluster.id)).toEqual([])
    expect(await getClusterRegistrationExportRows(adminSession, "no-such-cluster")).toEqual([])
  })

  it("covers only the events a staff user may access", async () => {
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0)
    const youth = await seedEvent(cluster.id, "Youth Night", 1)
    for (const eventId of [service.id, youth.id]) {
      await db.eventRegistrant.create({
        data: { eventId, firstName: "Ana", lastName: "Lopez" },
      })
    }

    const scopedStaff = {
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Export"] }],
        eventAccess: [youth.id],
      },
    } as unknown as Session

    const rows = await getClusterRegistrationExportRows(scopedStaff, cluster.id)
    expect(rows.map((r) => Object.keys(r.events))).toEqual([[youth.id]])
    expect(rows.every((r) => r.events[service.id] === undefined)).toBe(true)
  })
})

describe("getClusterFormCoverage", () => {
  it("unions what every member event's form asks for", async () => {
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0)
    const youth = await seedEvent(cluster.id, "Youth Night", 1)
    await db.eventFormConfig.create({
      data: { eventId: service.id, context: "Register", fieldGender: true },
    })
    await db.eventFormConfig.create({
      data: { eventId: youth.id, context: "CheckIn", fieldWorkCity: true },
    })

    const coverage = await getClusterFormCoverage(adminSession, cluster.id)
    expect(coverage.fieldGender).toBe(true)
    expect(coverage.fieldWorkCity).toBe(true)
    expect(coverage.fieldLanguage).toBe(false)
  })

  it("includes the cluster's own shared form", async () => {
    const cluster = await seedCluster()
    await seedEvent(cluster.id, "Service", 0)
    await db.eventFormConfig.create({
      data: { clusterId: cluster.id, context: "Register", sectionDietary: true },
    })

    const coverage = await getClusterFormCoverage(adminSession, cluster.id)
    expect(coverage.sectionDietary).toBe(true)
  })

  it("ignores the form config of an event this user cannot access", async () => {
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0)
    const youth = await seedEvent(cluster.id, "Youth Night", 1)
    await db.eventFormConfig.create({
      data: { eventId: service.id, context: "Register", fieldGender: true },
    })

    const scopedStaff = {
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Export"] }],
        eventAccess: [youth.id],
      },
    } as unknown as Session

    const coverage = await getClusterFormCoverage(scopedStaff, cluster.id)
    expect(coverage.fieldGender).toBe(false)
  })
})

describe("getClusterRegistrationExport", () => {
  it("offers a Yes/No column per cluster event, in cluster order", async () => {
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0)
    const youth = await seedEvent(cluster.id, "Youth Night", 1)
    await db.eventRegistrant.create({
      data: { eventId: service.id, firstName: "Ana", lastName: "Lopez" },
    })

    const { events, columns } = await getClusterRegistrationExport(
      adminSession,
      cluster.id
    )

    expect(events).toEqual([
      { id: service.id, name: "Service" },
      { id: youth.id, name: "Youth Night" },
    ])
    // Both events get a column, including the one nobody registered for.
    expect(columns.filter((c) => c.group === "Events").map((c) => c.label)).toEqual([
      "Service",
      "Youth Night",
    ])
    expect(
      columns.filter((c) => c.group === "Event Check-ins").map((c) => c.label)
    ).toEqual(["Service (Checked In)", "Youth Night (Checked In)"])
  })

  it("offers only the events a staff user may access as columns", async () => {
    const cluster = await seedCluster()
    const service = await seedEvent(cluster.id, "Service", 0)
    const youth = await seedEvent(cluster.id, "Youth Night", 1)
    await db.eventRegistrant.create({
      data: { eventId: youth.id, firstName: "Ana", lastName: "Lopez" },
    })

    const scopedStaff = {
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Export"] }],
        eventAccess: [youth.id],
      },
    } as unknown as Session

    const { events, columns } = await getClusterRegistrationExport(
      scopedStaff,
      cluster.id
    )
    expect(events).toEqual([{ id: youth.id, name: "Youth Night" }])
    expect(columns.filter((c) => c.group === "Events").map((c) => c.label)).toEqual([
      "Youth Night",
    ])
    expect(service.id).toBeDefined()
  })

  it("offers asked-for columns alongside the core, and drops the rest", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", fieldWorkCity: true },
    })
    await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Ana", lastName: "Lopez" },
    })

    const { columns } = await getClusterRegistrationExport(adminSession, cluster.id)
    const byKey = new Map(columns.map((c) => [c.key, c]))

    expect(byKey.get("firstName")).toMatchObject({ core: true })
    // Asked for, nobody answered — still offered, so the gap is visible.
    expect(byKey.get("workCity")).toMatchObject({ collected: true, hasData: false })
    // Never asked, no answers — not worth a blank column.
    expect(byKey.has("dietary")).toBe(false)
    expect(byKey.has("language")).toBe(false)
  })

  it("keeps a column whose toggle was switched off after answers came in", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    const guest = await db.guest.create({
      data: { firstName: "Pedro", lastName: "Reyes", gender: "Male", language: [] },
    })
    await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const { columns } = await getClusterRegistrationExport(adminSession, cluster.id)
    expect(columns.find((c) => c.key === "gender")).toMatchObject({
      collected: false,
      hasData: true,
    })
  })
})

describe("getClusterRegistrationsExport", () => {
  it("returns the rows, events and columns for an authorised caller", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Ana", lastName: "Lopez" },
    })

    const result = await getClusterRegistrationsExport(cluster.id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.rows).toHaveLength(1)
    expect(result.data.rows[0]).toMatchObject({ lastName: "Lopez" })
    expect(result.data.rows[0].events).toEqual({ [event.id]: { checkedIn: false } })
    expect(result.data.events).toEqual([{ id: event.id, name: "Service" }])
    expect(result.data.columns.some((c) => c.key === `event:${event.id}`)).toBe(true)
  })

  it("rejects unauthenticated callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const result = await getClusterRegistrationsExport("any-cluster")
    expect(result).toEqual({ success: false, error: "Not authenticated." })
  })

  it("rejects users without the Events export permission", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: "staff",
        role: "Staff",
        permissions: [{ feature: "Events", actions: ["Read", "Write"] }],
        eventAccess: [],
      },
    } as never)

    const result = await getClusterRegistrationsExport("any-cluster")
    expect(result).toEqual({ success: false, error: "Unauthorized." })
  })
})
