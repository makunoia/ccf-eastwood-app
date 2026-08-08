import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  enableModule,
  disableModule,
  setPricedModule,
} from "@/app/(dashboard)/events/module-actions"
import { createEvent } from "@/app/(dashboard)/events/actions"
import { getEventSetupChecklist } from "@/lib/events/setup-checklist"
import type { EventModuleType } from "@/app/generated/prisma/client"

/**
 * CCF-131 (Volunteers) and CCF-128 (Breakout Groups) as per-event modules.
 *
 * The dependency rules are the load-bearing part: enabling a dependent module has
 * to bring its requirements with it, and disabling one out from under a dependent
 * has to fail — server-side, not merely in the UI.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventModule", "Volunteer", "VolunteerCommittee", "BreakoutGroup", "Member", "Event" RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

async function makeEvent(type: "OneTime" | "MultiDay" | "Recurring" = "OneTime") {
  const event = await db.event.create({
    data: {
      name: "Module Test Event",
      type,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
    },
    select: { id: true },
  })
  return event.id
}

/** Create an event the way the form does: details plus a module selection. */
async function create(
  over: {
    types?: EventModuleType[]
    price?: string
    type?: "OneTime" | "MultiDay" | "Recurring"
    recurrenceDayOfWeek?: string
    recurrenceFrequency?: string
  } = {}
) {
  return createEvent(
    {
      name: "Fresh Event",
      description: "",
      ministryIds: [],
      allMinistries: false,
      type: over.type ?? "OneTime",
      startDate: "2026-10-01",
      endDate: "",
      recurrenceDayOfWeek: over.recurrenceDayOfWeek ?? "",
      recurrenceFrequency: over.recurrenceFrequency ?? "",
      recurrenceEndDate: "",
    },
    { types: over.types ?? [], price: over.price ?? "" }
  )
}

async function modulesFor(eventId: string): Promise<EventModuleType[]> {
  const rows = await db.eventModule.findMany({
    where: { eventId },
    select: { type: true },
  })
  return rows.map((r) => r.type).sort()
}

describe("enableModule dependency closure", () => {
  it("enables Volunteers alongside Breakout Groups", async () => {
    const eventId = await makeEvent()

    const result = await enableModule(eventId, "Breakout")

    expect(result.success).toBe(true)
    expect(await modulesFor(eventId)).toEqual(["Breakout", "Volunteers"])
  })

  it("enables Volunteers and Breakout alongside Catch Mech", async () => {
    const eventId = await makeEvent()

    const result = await enableModule(eventId, "CatchMech")

    expect(result.success).toBe(true)
    expect(await modulesFor(eventId)).toEqual(["Breakout", "CatchMech", "Volunteers"])
  })

  it("reports back exactly which modules it turned on", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "Volunteers")

    const result = await enableModule(eventId, "CatchMech")

    expect(result.success).toBe(true)
    // Volunteers was already on, so it must not be reported as newly enabled.
    if (result.success) {
      expect(result.data.enabled.sort()).toEqual(["Breakout", "CatchMech"])
    }
  })

  it("enables Volunteers alongside Embarkation, but not Breakout", async () => {
    const eventId = await makeEvent()

    await enableModule(eventId, "Embarkation")

    expect(await modulesFor(eventId)).toEqual(["Embarkation", "Volunteers"])
  })

  it("is idempotent", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "Breakout")
    await enableModule(eventId, "Breakout")

    expect(await modulesFor(eventId)).toEqual(["Breakout", "Volunteers"])
  })

})

describe("disableModule dependency guard", () => {
  it("refuses to disable Volunteers while Breakout is enabled", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "Breakout")

    const result = await disableModule(eventId, "Volunteers")

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("Breakout Groups")
    expect(await modulesFor(eventId)).toEqual(["Breakout", "Volunteers"])
  })

  it("refuses to disable Breakout while Catch Mech is enabled", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "CatchMech")

    const result = await disableModule(eventId, "Breakout")

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("Catch Mech")
  })

  it("succeeds once the dependents are turned off, in order", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "CatchMech")

    expect((await disableModule(eventId, "CatchMech")).success).toBe(true)
    expect((await disableModule(eventId, "Breakout")).success).toBe(true)
    expect((await disableModule(eventId, "Volunteers")).success).toBe(true)
    expect(await modulesFor(eventId)).toEqual([])
  })

  it("retains volunteer records — disabling hides the feature, it never deletes data", async () => {
    const eventId = await makeEvent()
    await enableModule(eventId, "Volunteers")

    const member = await db.member.create({
      data: {
        firstName: "Vol",
        lastName: "Unteer",
        dateJoined: new Date(),
        language: [],
      },
      select: { id: true },
    })
    const committee = await db.volunteerCommittee.create({
      data: { name: "Logistics", eventId },
      select: { id: true },
    })
    const role = await db.committeeRole.create({
      data: { name: "Usher", committeeId: committee.id },
      select: { id: true },
    })
    await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId,
        committeeId: committee.id,
        preferredRoleId: role.id,
      },
    })

    const result = await disableModule(eventId, "Volunteers")

    expect(result.success).toBe(true)
    expect(await db.volunteer.count({ where: { eventId } })).toBe(1)
    expect(await db.volunteerCommittee.count({ where: { eventId } })).toBe(1)
  })
})

describe("modules are chosen on the create-event form", () => {
  it("enables no modules when the admin picks none", async () => {
    const result = await create()

    expect(result.success).toBe(true)
    if (result.success) expect(await modulesFor(result.data.id)).toEqual([])
  })

  it("creates a row per picked module", async () => {
    const result = await create({ types: ["Baptism"] })

    expect(result.success).toBe(true)
    if (result.success) expect(await modulesFor(result.data.id)).toEqual(["Baptism"])
  })

  it("pulls in requirements, so a Catch Mech pick also lands Volunteers and Breakout", async () => {
    const result = await create({ types: ["CatchMech"] })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(await modulesFor(result.data.id)).toEqual([
        "Breakout",
        "CatchMech",
        "Volunteers",
      ])
    }
  })

  it("drops picks the event type doesn't offer", async () => {
    const result = await create({
      types: ["Embarkation", "Priced", "Baptism"],
      price: "2500",
      type: "Recurring",
      recurrenceDayOfWeek: "0",
      recurrenceFrequency: "Weekly",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // Embarkation and Priced are unavailable for Recurring; Baptism survives, and
      // Volunteers rides along as Embarkation's requirement is never reached.
      expect(await modulesFor(result.data.id)).toEqual(["Baptism"])
      const event = await db.event.findUnique({
        where: { id: result.data.id },
        select: { price: true },
      })
      expect(event?.price).toBeNull()
    }
  })

  describe("Priced", () => {
    it("stores the fee in cents alongside the module row", async () => {
      const result = await create({ types: ["Priced"], price: "2500" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(await modulesFor(result.data.id)).toEqual(["Priced"])
        const event = await db.event.findUnique({
          where: { id: result.data.id },
          select: { price: true },
        })
        expect(event?.price).toBe(250000)
      }
    })

    it("refuses to create a priced event with no fee", async () => {
      const result = await create({ types: ["Priced"] })

      expect(result.success).toBe(false)
      expect(await db.event.count()).toBe(0)
    })

    it("ignores a stray price when Priced wasn't picked", async () => {
      const result = await create({ types: ["Baptism"], price: "2500" })

      expect(result.success).toBe(true)
      if (result.success) {
        const event = await db.event.findUnique({
          where: { id: result.data.id },
          select: { price: true },
        })
        expect(event?.price).toBeNull()
      }
    })
  })
})

describe("setup checklist follows module state", () => {
  it("shows only the always-on steps for a bare event — modules are decided at creation", async () => {
    const eventId = await makeEvent()

    const checklist = await getEventSetupChecklist(eventId, "OneTime", [])

    expect(checklist.steps.map((s) => s.key)).toEqual(["form", "register", "checkin"])
    expect(checklist.totalCount).toBe(3)
  })

  it("adds the volunteer and breakout steps once those modules are on", async () => {
    const eventId = await makeEvent()

    const checklist = await getEventSetupChecklist(eventId, "OneTime", [
      "Volunteers",
      "Breakout",
    ])

    expect(checklist.steps.map((s) => s.key)).toEqual([
      "committees",
      "volunteers",
      "breakouts",
      "form",
      "register",
      "checkin",
    ])
  })

  it("never offers a modules step", async () => {
    const eventId = await makeEvent()

    const bare = await getEventSetupChecklist(eventId, "OneTime", [])
    const loaded = await getEventSetupChecklist(eventId, "OneTime", ["Baptism"])

    expect(bare.steps.map((s) => s.key)).not.toContain("modules")
    expect(loaded.steps.map((s) => s.key)).not.toContain("modules")
  })

  it("still omits the session step for OneTime events", async () => {
    const eventId = await makeEvent()

    const checklist = await getEventSetupChecklist(eventId, "OneTime", ["Volunteers"])

    expect(checklist.steps.map((s) => s.key)).not.toContain("sessions")
  })
})


describe("Priced module", () => {
  it("rejects a blank price", async () => {
    const eventId = await makeEvent()

    const result = await setPricedModule(eventId, "")

    expect(result.success).toBe(false)
    expect(await modulesFor(eventId)).toEqual([])
  })

  it("rejects a zero or negative price", async () => {
    const eventId = await makeEvent()

    expect((await setPricedModule(eventId, "0")).success).toBe(false)
    expect((await setPricedModule(eventId, "-10")).success).toBe(false)
  })

  it("stores the price in cents and enables the module", async () => {
    const eventId = await makeEvent()

    const result = await setPricedModule(eventId, "2500.50")

    expect(result.success).toBe(true)
    expect(await modulesFor(eventId)).toEqual(["Priced"])
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { price: true },
    })
    expect(event?.price).toBe(250050)
  })

  it("clears the price when the module is disabled", async () => {
    const eventId = await makeEvent()
    await setPricedModule(eventId, "1500")

    const result = await disableModule(eventId, "Priced")

    expect(result.success).toBe(true)
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { price: true },
    })
    expect(event?.price).toBeNull()
    expect(await modulesFor(eventId)).toEqual([])
  })

  it("requires the price again after a disable/re-enable cycle", async () => {
    const eventId = await makeEvent()
    await setPricedModule(eventId, "1500")
    await disableModule(eventId, "Priced")

    // Re-enabling through the plain module toggle leaves the event free until a
    // price is supplied — the amount is deliberately not remembered.
    await enableModule(eventId, "Priced")
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { price: true },
    })
    expect(event?.price).toBeNull()
  })

  it("refuses to price a Recurring event", async () => {
    const eventId = await makeEvent("Recurring")

    const result = await setPricedModule(eventId, "1000")

    expect(result.success).toBe(false)
    expect(await modulesFor(eventId)).toEqual([])
  })
})
