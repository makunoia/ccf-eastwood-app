import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { getClusterRegistrationExportRows } from "@/lib/clusters/aggregate"
import { getClusterRegistrationsExport } from "@/app/(event)/cluster/[id]/registrants/export-actions"

/**
 * Export of registration records for an Event Cluster.
 *
 *  - integration: one row per registration (not per person), names/contacts
 *                 resolved from Member → Guest → the registrant's own fields,
 *                 ordered by cluster order then last/first name
 *  - edge case:   dateless cluster, cluster with no events, walk-in with no FK,
 *                 check-in scoped to the cluster's day (OneTime vs occurrence)
 *  - permissions: unauthenticated / no Export action / partial event access
 *  - unit:        table builder covered in tests/unit/cluster-registrations-export
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
    "EventRegistrant", "EventClusterEvent", "EventCluster",
    "Event", "Guest", "Member"
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
  it("returns one row per registration with names resolved from member, guest, or the registrant", async () => {
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

    expect(rows).toHaveLength(4)
    // Cluster order first (Service before Youth Night), then last/first name.
    expect(rows.map((r) => [r.eventName, r.lastName])).toEqual([
      ["Service", "Lopez"],
      ["Service", "Reyes"],
      ["Service", "Santos"],
      ["Youth Night", "Santos"],
    ])

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
    expect(rows[1]).toMatchObject({
      firstName: "Pedro",
      email: "pedro@example.com",
      mobile: "+63 917 333 4444",
      type: "Guest",
      viaSharedForm: true,
    })
    expect(rows[0]).toMatchObject({
      firstName: "Ana",
      nickname: "Anne",
      email: null,
      mobile: "+63 917 555 6666",
      type: "Guest",
    })
    expect(new Date(rows[0].registeredAt).getTime()).not.toBeNaN()
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
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Ana", lastName: "Lopez" },
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
    expect(rows.map((r) => r.eventName)).toEqual(["Youth Night"])
  })
})

describe("getClusterRegistrationsExport", () => {
  it("returns the rows for an authorised caller", async () => {
    const cluster = await seedCluster()
    const event = await seedEvent(cluster.id, "Service", 0)
    await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Ana", lastName: "Lopez" },
    })

    const result = await getClusterRegistrationsExport(cluster.id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({ eventName: "Service", lastName: "Lopez" })
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
