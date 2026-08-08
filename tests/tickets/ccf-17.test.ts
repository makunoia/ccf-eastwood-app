import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

/**
 * Ticket verification suite for CCF-17.
 * Custom component for Mobile Number and Email — allow "I don't have one" option.
 *
 * Key behavior:
 * - Mobile number is now optional on event registration
 * - Email is now optional on event registration
 * - When no mobile is provided, a guest is created without a phone number
 * - When no email is provided, a guest is created without an email
 * - Providing a mobile number still correctly finds/creates a guest by phone (regression)
 */

let testEventId: string

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventRegistrant", "Guest", "Member", "Event" RESTART IDENTITY CASCADE`

  const event = await db.event.create({
    data: {
      name: "Test Event CCF-17",
      type: "OneTime",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-01"),
    },
  })
  testEventId = event.id
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-17", () => {
  describe("unit", () => {
    it("registrantSchema accepts empty mobileNumber", async () => {
      // The schema is private to actions.ts, so we test it via the action
      const result = await createRegistrant(
        testEventId,
        {
          firstName: "Maria",
          lastName: "Santos",
          mobileNumber: "",
          email: "",
          language: [],
        },
        null
      )
      expect(result.success).toBe(true)
    })

    it("registrantSchema accepts null/undefined mobileNumber", async () => {
      const result = await createRegistrant(
        testEventId,
        {
          firstName: "Maria",
          lastName: "Santos",
          mobileNumber: undefined,
          email: "",
          language: [],
        },
        null
      )
      expect(result.success).toBe(true)
    })
  })

  describe("integration", () => {
    it("creates a guest without phone when mobile is not provided", async () => {
      const result = await createRegistrant(
        testEventId,
        {
          firstName: "Juan",
          lastName: "dela Cruz",
          mobileNumber: "",
          email: "",
          language: [],
        },
        null
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        include: { guest: true },
      })

      expect(registrant).not.toBeNull()
      expect(registrant?.guest).not.toBeNull()
      expect(registrant?.guest?.phone).toBeNull()
    })

    it("creates a guest without email when email is not provided", async () => {
      const result = await createRegistrant(
        testEventId,
        {
          firstName: "Ana",
          lastName: "Reyes",
          mobileNumber: "+63 917 123 4567",
          email: "",
          language: [],
        },
        null
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        include: { guest: true },
      })

      expect(registrant?.guest?.email).toBeNull()
    })

    it("multiple registrants with no mobile can be created (no phone collision)", async () => {
      const r1 = await createRegistrant(
        testEventId,
        { firstName: "First", lastName: "Person", mobileNumber: "", email: "", language: [] },
        null
      )
      const r2 = await createRegistrant(
        testEventId,
        { firstName: "Second", lastName: "Person", mobileNumber: "", email: "", language: [] },
        null
      )

      expect(r1.success).toBe(true)
      expect(r2.success).toBe(true)

      // Both create separate guest records (no phone match collision)
      const guests = await db.guest.findMany({ where: { phone: null } })
      expect(guests.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe("regression", () => {
    it("registrant with mobile number still creates a guest linked by phone", async () => {
      const mobile = "+63 912 345 6789"

      const result = await createRegistrant(
        testEventId,
        {
          firstName: "Pedro",
          lastName: "Penduko",
          mobileNumber: mobile,
          email: "pedro@test.com",
          language: [],
        },
        null
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        include: { guest: true },
      })

      expect(registrant?.guest?.phone).toBe(mobile)
      expect(registrant?.guest?.email).toBe("pedro@test.com")
    })

    it("re-registering with same mobile reuses existing guest record", async () => {
      const event2 = await db.event.create({
        data: {
          name: "Second Event CCF-17",
          type: "OneTime",
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-07-01"),
        },
      })

      const mobile = "+63 919 876 5432"

      await createRegistrant(
        testEventId,
        { firstName: "Rosa", lastName: "Cruz", mobileNumber: mobile, email: "", language: [] },
        null
      )

      await createRegistrant(
        event2.id,
        { firstName: "Rosa", lastName: "Cruz", mobileNumber: mobile, email: "", language: [] },
        null
      )

      const guests = await db.guest.findMany({ where: { phone: mobile } })
      expect(guests.length).toBe(1)

      const registrants = await db.eventRegistrant.findMany({
        where: { guestId: guests[0].id },
      })
      expect(registrants.length).toBe(2)
    })
  })
})

