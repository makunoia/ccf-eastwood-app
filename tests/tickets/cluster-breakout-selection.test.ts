import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { db } from "@/lib/db"
import { registerForCluster } from "@/app/(dashboard)/events/cluster-actions"
import { facilitatorGateForOccurrences } from "@/lib/breakout-suggestion-server"
import {
  clusterNotApplicableToggles,
  clusterOffersBreakoutStep,
} from "@/lib/forms/cluster-sections"

/**
 * Breakout Group selection on a cluster's shared Registration / Walk-in form.
 *
 * A Collab day owns its own tables (CCF-148) but the shared form had no way to
 * let anyone choose one: the builder listed `sectionBreakout` as not applicable
 * and the fan-out passed `breakoutPick: null` unconditionally. Only auto-assign
 * and hand-seating could fill a collab day's tables.
 *
 *  - unit:        which sections each kind of day offers; the multi-session
 *                 facilitator gate
 *  - integration: a pick seats the person at the day's own table; a table owned
 *                 by a member event or another day is refused; the section being
 *                 off discards the pick; a Parallel day never honours one; a
 *                 member event without the Breakout module drops the placement
 *  - regression:  the two builder pages no longer hard-code `sectionBreakout`
 *                 into `notApplicable`
 *  - e2e:         skipped — the breakout step itself is unchanged, and the
 *                 single-event form already exercises it in the browser.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence", "BreakoutGroupMember", "BreakoutGroup",
    "Volunteer", "CommitteeRole", "VolunteerCommittee",
    "EventRegistrant", "EventFormConfig", "EventModule", "EventClusterEvent", "EventCluster",
    "Event", "Guest", "Member", "Ministry", "LifeStage", "SmallGroupMemberRequest"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

function payload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Juan",
    lastName: "dela Cruz",
    mobileNumber: "0917 123 4567",
    ...overrides,
  }
}

/**
 * A one-ministry Collab day: one member event holding the Breakout module, and a
 * cluster-owned table for the day. `sectionBreakout` is switched on for Register
 * unless the caller says otherwise.
 */
async function seedCollabDay(
  opts: { withModule?: boolean; sectionBreakout?: boolean; kind?: "Collab" | "Parallel" } = {}
) {
  const lifeStage = await db.lifeStage.create({ data: { name: "Singles", order: 1 } })
  const ministry = await db.ministry.create({
    data: { name: "Youth", lifeStageId: lifeStage.id, description: "" },
  })
  const event = await db.event.create({
    data: {
      name: "Youth Night",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      ministries: { create: { ministryId: ministry.id } },
    },
    select: { id: true },
  })
  if (opts.withModule ?? true) {
    await db.eventModule.create({ data: { eventId: event.id, type: "Breakout" } })
  }
  const cluster = await db.eventCluster.create({
    data: {
      name: "Collab Sunday",
      kind: opts.kind ?? "Collab",
      isOpen: true,
      events: { create: { eventId: event.id, order: 0 } },
    },
    select: { id: true, publicToken: true },
  })
  await db.eventFormConfig.create({
    data: {
      clusterId: cluster.id,
      context: "Register",
      sectionBreakout: opts.sectionBreakout ?? true,
    },
  })
  const table = await db.breakoutGroup.create({
    data: { clusterId: cluster.id, name: "Table 1" },
    select: { id: true },
  })
  return { cluster, event, table }
}

/** Where the person ended up sitting, if anywhere. */
async function seatOf(registrantId: string) {
  const row = await db.breakoutGroupMember.findFirst({
    where: { registrantId },
    select: { breakoutGroupId: true },
  })
  return row?.breakoutGroupId ?? null
}

// ─── Unit ────────────────────────────────────────────────────────────────────

describe("unit — which sections a cluster's shared form offers", () => {
  it("offers the breakout step on a Collab day, which owns its own tables", () => {
    expect(clusterOffersBreakoutStep("Collab")).toBe(true)
    expect(clusterNotApplicableToggles("Collab")).not.toContain("sectionBreakout")
  })

  it("withholds it on a Parallel day, whose events each run their own", () => {
    expect(clusterOffersBreakoutStep("Parallel")).toBe(false)
    expect(clusterNotApplicableToggles("Parallel")).toContain("sectionBreakout")
  })

  it("keeps payment and household out on every kind of day", () => {
    for (const kind of ["Collab", "Parallel"] as const) {
      expect(clusterNotApplicableToggles(kind)).toEqual(
        expect.arrayContaining(["sectionPayment", "sectionFamily", "familySpouseOnly"])
      )
    }
  })
})

describe("unit — the facilitator gate across a day's sessions", () => {
  it("is the plain single-session gate when the day names one", () => {
    const one = facilitatorGateForOccurrences(["e1"], ["occ1"])
    expect(one.OR).toHaveLength(3) // facilitator / co-facilitator / sub-facilitator
  })

  it("collapses duplicates rather than repeating a branch per member event", () => {
    const same = facilitatorGateForOccurrences(["e1", "e2"], ["occ1", "occ1"])
    expect(same).toEqual(facilitatorGateForOccurrences(["e1", "e2"], ["occ1"]))
  })

  it("ORs one gate per distinct session, so a mixed day answers both lanes", () => {
    // A OneTime member event names no session (its facilitators check in on
    // `Volunteer.attendedAt`); a Recurring one names its occurrence.
    const mixed = facilitatorGateForOccurrences(["e1", "e2"], [null, "occ1"])
    expect(mixed.OR).toHaveLength(2)
  })

  it("treats an empty list as 'no session named'", () => {
    expect(facilitatorGateForOccurrences(["e1"], [])).toEqual(
      facilitatorGateForOccurrences(["e1"], [null])
    )
  })
})

// ─── Integration ─────────────────────────────────────────────────────────────

describe("integration — a pick on the shared form", () => {
  it("seats the person at the day's own table", async () => {
    const { cluster, event, table } = await seedCollabDay()

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id],
      undefined,
      null,
      null,
      table.id
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    const [outcome] = result.data.results
    expect(outcome.status).toBe("registered")
    expect(outcome.breakoutGroup?.name).toBe("Table 1")
    expect(await seatOf(outcome.registrantId!)).toBe(table.id)
  })

  it("refuses a table owned by a member event rather than by the day", async () => {
    // The day's tables are cluster-owned; the ministry's standing ones sit
    // untouched and unused. Offering one would put someone at a table nothing on
    // this day reads.
    const { cluster, event } = await seedCollabDay()
    const standing = await db.breakoutGroup.create({
      data: { eventId: event.id, name: "Ministry table" },
      select: { id: true },
    })

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id],
      undefined,
      null,
      null,
      standing.id
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.results[0].breakoutGroup).toBeNull()
    expect(await seatOf(result.data.results[0].registrantId!)).toBeNull()
  })

  it("refuses a table belonging to another day", async () => {
    const { cluster, event } = await seedCollabDay()
    const other = await db.eventCluster.create({
      data: { name: "Some other day", kind: "Collab" },
      select: { id: true },
    })
    const foreign = await db.breakoutGroup.create({
      data: { clusterId: other.id, name: "Their table" },
      select: { id: true },
    })

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id],
      undefined,
      null,
      null,
      foreign.id
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(await seatOf(result.data.results[0].registrantId!)).toBeNull()
  })

  it("discards a pick submitted against a form whose step is switched off", async () => {
    // The crafted-POST defense: the public form withholds the step, so this only
    // ever fires on a request that didn't come from it.
    const { cluster, event, table } = await seedCollabDay({ sectionBreakout: false })

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id],
      undefined,
      null,
      null,
      table.id
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(await seatOf(result.data.results[0].registrantId!)).toBeNull()
  })

  it("never honours one on a Parallel day", async () => {
    const { cluster, event, table } = await seedCollabDay({ kind: "Parallel" })

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id],
      undefined,
      null,
      null,
      table.id
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(await seatOf(result.data.results[0].registrantId!)).toBeNull()
  })

  it("drops the placement when the person's own event lacks the Breakout module", async () => {
    // Pins the reason `clusterFormPrerequisites` warns about it: the day owning
    // the table isn't enough, so this fails silently at the write.
    const { cluster, event, table } = await seedCollabDay({ withModule: false })

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id],
      undefined,
      null,
      null,
      table.id
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(await seatOf(result.data.results[0].registrantId!)).toBeNull()
  })

  it("registers without a seat when nothing was picked", async () => {
    const { cluster, event } = await seedCollabDay()

    const result = await registerForCluster(
      cluster.publicToken,
      payload(),
      null,
      null,
      undefined,
      [event.id]
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.results[0].status).toBe("registered")
    expect(await seatOf(result.data.results[0].registrantId!)).toBeNull()
  })

  it("moves rather than double-seats when the same person picks again", async () => {
    // The second submission short-circuits on `already` — the day's work was done
    // the first time. A table chosen on THIS submission is the exception: it is a
    // decision taken just now, and the amend flow re-opens the registration by
    // design, so keeping the old table would quietly discard the answer.
    const { cluster, event, table } = await seedCollabDay()
    const second = await db.breakoutGroup.create({
      data: { clusterId: cluster.id, name: "Table 2" },
      select: { id: true },
    })

    const submit = (groupId: string) =>
      registerForCluster(
        cluster.publicToken,
        payload(),
        null,
        null,
        undefined,
        [event.id],
        undefined,
        null,
        null,
        groupId
      )

    const first = await submit(table.id)
    expect(first.success).toBe(true)
    await submit(second.id)

    const seats = await db.breakoutGroupMember.findMany({
      select: { breakoutGroupId: true },
    })
    expect(seats).toHaveLength(1)
    expect(seats[0].breakoutGroupId).toBe(second.id)
  })
})

// ─── Regression ──────────────────────────────────────────────────────────────

describe("regression — the builder pages stop hiding the step outright", () => {
  const pages = [
    "app/(event)/cluster/[id]/forms/registration/page.tsx",
    "app/(event)/cluster/[id]/forms/walk-in/page.tsx",
  ]

  it("derives notApplicable from the day's kind instead of a literal list", () => {
    for (const page of pages) {
      const source = readFileSync(page, "utf8")
      expect(source).toContain("clusterNotApplicableToggles(cluster.kind)")
      expect(source).not.toContain('"sectionBreakout"')
    }
  })
})
