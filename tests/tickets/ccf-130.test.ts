import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import {
  SUCCESS_MESSAGE_MAX_LENGTH,
  defaultSuccessMessage,
  resolveSuccessMessage,
} from "@/lib/forms/context-config"
import {
  getClusterFormSuccessMessage,
  getEventFormSuccessMessage,
  getEventFormSuccessMessages,
} from "@/lib/forms/context-config-server"
import {
  saveClusterFormSuccessMessage,
  saveEventFormSuccessMessage,
  setEventFormToggle,
} from "@/app/(dashboard)/events/form-config-actions"

/**
 * Ticket verification suite for CCF-130 — the registration success screen's sub
 * copy was hardcoded to invite people to "bring a friend", which is the wrong
 * message for an invite-only event. It's now editable per (event, context).
 *
 * Run locally:  pnpm verify:ticket CCF-130
 */

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

const CUSTOM = "You're on the list. This one's invite-only, so please don't share the link."

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "EventFormConfig", "EventCluster" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(name = "Youth Camp") {
  return db.event.create({
    data: {
      name,
      type: "OneTime",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
    },
  })
}

describe("CCF-130", () => {
  describe("unit — copy resolution and fallback", () => {
    it("falls back to the event-named default when nothing is configured", () => {
      expect(resolveSuccessMessage(null, "Register", "Youth Camp")).toBe(
        "You're all set for Youth Camp. We're so glad you're coming — feel free to bring a friend!"
      )
    })

    it("falls back to the generic default when there is no event name", () => {
      expect(resolveSuccessMessage(null, "Register")).toBe(
        "You're all set! We're so glad you're joining us. Feel free to bring a friend — see you soon!"
      )
    })

    it("keeps the walk-in default distinct — someone at the door has already arrived", () => {
      expect(resolveSuccessMessage(null, "WalkIn", "Youth Camp")).toBe(
        "You're registered and checked in. Enjoy the event!"
      )
      expect(defaultSuccessMessage("WalkIn")).not.toContain("bring a friend")
    })

    it("uses the configured copy when one is set", () => {
      expect(resolveSuccessMessage(CUSTOM, "Register", "Youth Camp")).toBe(CUSTOM)
    })

    it("treats a blank or whitespace-only stored value as unset", () => {
      const fallback = defaultSuccessMessage("Register", "Youth Camp")
      expect(resolveSuccessMessage("", "Register", "Youth Camp")).toBe(fallback)
      expect(resolveSuccessMessage("   \n ", "Register", "Youth Camp")).toBe(fallback)
      expect(resolveSuccessMessage(undefined, "Register", "Youth Camp")).toBe(fallback)
    })

    it("trims surrounding whitespace off configured copy", () => {
      expect(resolveSuccessMessage(`  ${CUSTOM}  `, "Register")).toBe(CUSTOM)
    })

    it("the default copy still invites a friend — existing events are unchanged", () => {
      expect(defaultSuccessMessage("Register", "Youth Camp")).toContain("bring a friend")
      expect(defaultSuccessMessage("Register")).toContain("bring a friend")
    })
  })

  describe("integration — saving and reading the message", () => {
    it("persists a custom message and reads it back", async () => {
      const event = await seedEvent()

      const result = await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)
      expect(result.success).toBe(true)

      expect(await getEventFormSuccessMessage(event.id, "Register")).toBe(CUSTOM)
    })

    it("creates the config row on first write when the event has none", async () => {
      const event = await seedEvent()
      expect(await db.eventFormConfig.count({ where: { eventId: event.id } })).toBe(0)

      await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)

      const rows = await db.eventFormConfig.findMany({ where: { eventId: event.id } })
      expect(rows).toHaveLength(1)
      expect(rows[0].context).toBe("Register")
    })

    it("leaves the section/field toggles untouched when saving copy", async () => {
      const event = await seedEvent()
      await setEventFormToggle(event.id, "Register", "sectionSmallGroup", true)

      await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)

      const row = await db.eventFormConfig.findUnique({
        where: { eventId_context: { eventId: event.id, context: "Register" } },
      })
      expect(row?.sectionSmallGroup).toBe(true)
      expect(row?.successMessage).toBe(CUSTOM)
    })

    it("does not clobber a saved message when a toggle is later flipped", async () => {
      const event = await seedEvent()
      await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)

      await setEventFormToggle(event.id, "Register", "sectionDietary", true)

      expect(await getEventFormSuccessMessage(event.id, "Register")).toBe(CUSTOM)
    })

    it("keeps Register and Walk-in independent", async () => {
      const event = await seedEvent()

      await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)

      expect(await getEventFormSuccessMessage(event.id, "Register")).toBe(CUSTOM)
      expect(await getEventFormSuccessMessage(event.id, "WalkIn")).toBeNull()
    })

    it("reads every context at once for the builder", async () => {
      const event = await seedEvent()
      await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)

      const all = await getEventFormSuccessMessages(event.id)
      expect(all).toEqual({ Register: CUSTOM, WalkIn: null, CheckIn: null })
    })

    it("returns null for an event that has never been configured", async () => {
      const event = await seedEvent()
      expect(await getEventFormSuccessMessage(event.id, "Register")).toBeNull()
    })
  })

  describe("edge cases", () => {
    it("stores NULL for a blank submission so 'unset' has one representation", async () => {
      const event = await seedEvent()
      await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)

      const result = await saveEventFormSuccessMessage(event.id, "Register", "")
      expect(result.success).toBe(true)

      const row = await db.eventFormConfig.findUnique({
        where: { eventId_context: { eventId: event.id, context: "Register" } },
      })
      expect(row?.successMessage).toBeNull()
    })

    it("clearing reverts the rendered copy to the default", async () => {
      const event = await seedEvent()
      await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)
      await saveEventFormSuccessMessage(event.id, "Register", "   ")

      const stored = await getEventFormSuccessMessage(event.id, "Register")
      expect(resolveSuccessMessage(stored, "Register", event.name)).toBe(
        defaultSuccessMessage("Register", event.name)
      )
    })

    it("treats an explicit null as a clear", async () => {
      const event = await seedEvent()
      await saveEventFormSuccessMessage(event.id, "Register", CUSTOM)

      await saveEventFormSuccessMessage(event.id, "Register", null)
      expect(await getEventFormSuccessMessage(event.id, "Register")).toBeNull()
    })

    it("rejects a message over the length cap without writing anything", async () => {
      const event = await seedEvent()
      const tooLong = "x".repeat(SUCCESS_MESSAGE_MAX_LENGTH + 1)

      const result = await saveEventFormSuccessMessage(event.id, "Register", tooLong)
      expect(result.success).toBe(false)
      expect(await db.eventFormConfig.count({ where: { eventId: event.id } })).toBe(0)
    })

    it("accepts a message exactly at the length cap", async () => {
      const event = await seedEvent()
      const atCap = "x".repeat(SUCCESS_MESSAGE_MAX_LENGTH)

      const result = await saveEventFormSuccessMessage(event.id, "Register", atCap)
      expect(result.success).toBe(true)
      expect(await getEventFormSuccessMessage(event.id, "Register")).toBe(atCap)
    })

    it("rejects an unknown form context", async () => {
      const event = await seedEvent()
      const result = await saveEventFormSuccessMessage(
        event.id,
        "Nonsense" as "Register",
        CUSTOM
      )
      expect(result.success).toBe(false)
    })

    it("rejects a message for an event that does not exist", async () => {
      const result = await saveEventFormSuccessMessage("no-such-event", "Register", CUSTOM)
      expect(result.success).toBe(false)
    })
  })

  describe("integration — cluster shared form", () => {
    it("persists and reads a cluster's success message", async () => {
      const cluster = await db.eventCluster.create({
        data: { name: "Sunday Service", date: new Date("2026-08-02") },
      })

      const result = await saveClusterFormSuccessMessage(cluster.id, "Register", CUSTOM)
      expect(result.success).toBe(true)
      expect(await getClusterFormSuccessMessage(cluster.id, "Register")).toBe(CUSTOM)
    })

    // A cluster *does* have a check-in surface — the day's kiosk, whose form
    // config is written like any other. What it has no room for is a success
    // message: the board confirms attendance in place and never shows a screen
    // that could carry one.
    it("rejects Check-in — the day's kiosk has no success screen", async () => {
      const cluster = await db.eventCluster.create({
        data: { name: "Sunday Service", date: new Date("2026-08-02") },
      })

      const result = await saveClusterFormSuccessMessage(cluster.id, "CheckIn", CUSTOM)
      expect(result.success).toBe(false)
    })
  })
})
