import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"
import { signIdentityGrant } from "@/lib/security/identity-grant"

const baseRegistrantInput = {
  firstName: "Test",
  lastName: "User",
  nickname: null,
  email: "test@example.com",
  mobileNumber: "+639171234567",
  birthMonth: 5,
  birthYear: 1990,
  lifeStageId: null,
  gender: null as "Male" | "Female" | null,
  language: [],
  meetingPreference: null as "Online" | "Hybrid" | "InPerson" | null,
  workCity: null,
  scheduleDayOfWeek: null,
  scheduleTimeStart: null,
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventRegistrant", "OccurrenceAttendee", "SmallGroupMemberRequest", "EventFormConfig", "Guest", "Member", "Event", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-01"),
    },
    select: { id: true },
  })
}

async function seedMember(overrides: Partial<Parameters<typeof db.member.create>[0]["data"]> = {}) {
  return db.member.create({
    data: {
      firstName: "John",
      lastName: "Doe",
      dateJoined: new Date(),
      phone: "+639170000001",
      language: [],
      ...overrides,
    },
    select: { id: true },
  })
}

async function seedGuest(overrides: Partial<Parameters<typeof db.guest.create>[0]["data"]> = {}) {
  return db.guest.create({
    data: {
      firstName: "Jane",
      lastName: "Doe",
      phone: "+639180000001",
      language: [],
      ...overrides,
    },
    select: { id: true },
  })
}

/**
 * Ticket: CCF-61 — Registrants should not be able to register twice.
 */
describe("CCF-61 – Prevent duplicate event registration", () => {
  describe("integration", () => {
    it("prevents a confirmed member from registering for the same event twice", async () => {
      const event = await seedEvent()
      const member = await seedMember()

      // First registration should succeed
      const first = await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)
      expect(first.success).toBe(true)

      // Second registration with same member should fail
      const second = await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)
      expect(second.success).toBe(false)
      if (!second.success) {
        expect(second.error).toMatch(/already registered/i)
      }
    })

    it("prevents a confirmed guest from registering for the same event twice", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()

      // First registration should succeed
      const first = await createRegistrant(event.id, { ...baseRegistrantInput }, null, guest.id)
      expect(first.success).toBe(true)

      // Second registration with same guest should fail
      const second = await createRegistrant(event.id, { ...baseRegistrantInput }, null, guest.id)
      expect(second.success).toBe(false)
      if (!second.success) {
        expect(second.error).toMatch(/already registered/i)
      }
    })

    it("prevents a non-member (new guest path) from registering for the same event twice via same phone number", async () => {
      const event = await seedEvent()

      // First registration — creates a guest record
      const first = await createRegistrant(event.id, { ...baseRegistrantInput }, null)
      expect(first.success).toBe(true)

      // Second registration with same phone — finds the same guest → duplicate
      const second = await createRegistrant(event.id, { ...baseRegistrantInput }, null)
      expect(second.success).toBe(false)
      if (!second.success) {
        expect(second.error).toMatch(/already registered/i)
      }
    })
  })

  describe("regression", () => {
    it("allows the same person to register for different events", async () => {
      const event1 = await seedEvent()
      const event2 = await db.event.create({
        data: {
          name: "Second Event",
          type: "OneTime",
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-07-01"),
        },
        select: { id: true },
      })
      const member = await seedMember()

      const first = await createRegistrant(event1.id, { ...baseRegistrantInput }, member.id, null)
      expect(first.success).toBe(true)

      // Same member can register for a different event
      const second = await createRegistrant(event2.id, { ...baseRegistrantInput }, member.id, null)
      expect(second.success).toBe(true)
    })

    it("does not create a duplicate EventRegistrant record in the DB after the second attempt", async () => {
      const event = await seedEvent()
      const member = await seedMember()

      await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)
      await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)

      const count = await db.eventRegistrant.count({
        where: { eventId: event.id, memberId: member.id },
      })
      expect(count).toBe(1)
    })

    it("names the duplicate as a reason, not just in the message", async () => {
      // The form routes this to a screen with somewhere to go rather than a toast
      // that fades off a finished form. Matching on the copy to decide that would
      // break the first time anyone rewords it.
      const event = await seedEvent()
      const member = await seedMember()

      await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)
      const second = await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)

      expect(second.success).toBe(false)
      if (second.success) throw new Error("expected a refusal")
      expect(second.reason).toBe("alreadyRegistered")
    })
  })

  /**
   * The one way past the duplicate guard: a proven owner updating the registration
   * they already hold, because the event started asking for something after they
   * signed up.
   *
   * Everything here turns on the grant. Without it these are the refusals above —
   * which is the point, since a public form that let any caller rewrite an
   * existing registration would be a worse hole than the one the guard closes.
   */
  describe("amending an existing registration", () => {
    const asOwner = (recordId: string, recordType: "member" | "guest" = "member") =>
      signIdentityGrant({ recordId, recordType })

    it("updates the registration in place rather than refusing", async () => {
      const event = await seedEvent()
      const member = await seedMember()

      const first = await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)
      expect(first.success).toBe(true)
      if (!first.success) return

      const amended = await createRegistrant(
        event.id, { ...baseRegistrantInput }, member.id,
        null, undefined, null, undefined, undefined,
        asOwner(member.id)
      )

      expect(amended.success).toBe(true)
      if (!amended.success) return
      expect(amended.data.id).toBe(first.data.id)
      expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(1)
    })

    it("collects the answer the event started asking for", async () => {
      const lifeStage = await db.lifeStage.create({ data: { name: "Young Pro", order: 1 } })
      const event = await db.event.create({
        data: {
          name: "Test Event", type: "OneTime",
          startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01"),
          eventFormConfigs: {
            create: { context: "Register", fieldLifeStage: true, fieldLifeStageRequired: true },
          },
        },
        select: { id: true },
      })
      const member = await seedMember({ lifeStageId: null })

      // They registered before the field existed, so their profile can't answer it.
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

      const amended = await createRegistrant(
        event.id,
        { ...baseRegistrantInput, lifeStageId: lifeStage.id },
        member.id,
        null, undefined, null, undefined, undefined,
        asOwner(member.id)
      )

      expect(amended.success).toBe(true)
      const after = await db.member.findUniqueOrThrow({ where: { id: member.id } })
      expect(after.lifeStageId).toBe(lifeStage.id)
      expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(1)
    })

    it("collects a dietary preference the event started requiring", async () => {
      // The catering case: the section is added and marked required after people
      // have already signed up, and amend is the only route that can collect it.
      const event = await db.event.create({
        data: {
          name: "Test Event", type: "OneTime",
          startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01"),
          eventFormConfigs: {
            create: { context: "Register", sectionDietary: true, sectionDietaryRequired: true },
          },
        },
        select: { id: true },
      })
      const member = await seedMember()
      const existing = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: member.id },
        select: { id: true },
      })

      const amended = await createRegistrant(
        event.id,
        { ...baseRegistrantInput, dietaryPreference: "Vegan" },
        member.id,
        null, undefined, null, undefined, undefined,
        asOwner(member.id)
      )

      expect(amended.success).toBe(true)
      const after = await db.eventRegistrant.findUniqueOrThrow({ where: { id: existing.id } })
      expect(after.dietaryPreference).toBe("Vegan")
      expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(1)
    })

    it("refuses an amend that leaves the newly required section blank", async () => {
      const event = await db.event.create({
        data: {
          name: "Test Event", type: "OneTime",
          startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01"),
          eventFormConfigs: {
            create: { context: "Register", sectionDietary: true, sectionDietaryRequired: true },
          },
        },
        select: { id: true },
      })
      const member = await seedMember()
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

      const amended = await createRegistrant(
        event.id, { ...baseRegistrantInput }, member.id,
        null, undefined, null, undefined, undefined,
        asOwner(member.id)
      )

      expect(amended.success).toBe(false)
      if (amended.success) throw new Error("expected a refusal")
      expect(amended.error).toMatch(/Dietary Restrictions is required/i)
    })

    it("lets an amend through on an event whose Payment section is required", async () => {
      // Regression: `askedFieldsFor` returns `sectionPayment`, and the required
      // check ran before the amend path strips payment — so a proven owner
      // clicking "Update my details" was refused with "Payment is required"
      // against a form that deliberately has no Payment step. Unsatisfiable by
      // any input, on the only route the event offers for answering.
      const event = await db.event.create({
        data: {
          name: "Test Event", type: "OneTime",
          startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01"),
          price: 50000,
          // `getEffectiveFormConfig` forces `sectionPayment` to follow the Priced
          // module, so the config flag alone proves nothing — without this row the
          // section is off and the required check never fires.
          modules: { create: { type: "Priced" } },
          eventFormConfigs: {
            create: {
              context: "Register",
              sectionPayment: true,
              sectionPaymentRequired: true,
              sectionDietary: true,
            },
          },
        },
        select: { id: true },
      })
      const member = await seedMember()
      const existing = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: member.id, paymentReference: "GC-ORIGINAL" },
        select: { id: true },
      })

      const amended = await createRegistrant(
        event.id,
        { ...baseRegistrantInput, dietaryPreference: "Vegan" },
        member.id,
        null, undefined, null, undefined, undefined,
        asOwner(member.id)
      )

      expect(amended.success).toBe(true)
      const after = await db.eventRegistrant.findUniqueOrThrow({ where: { id: existing.id } })
      expect(after.dietaryPreference).toBe("Vegan")
      // Payment is still not amendable from a public form — the stored reference
      // survives untouched rather than being cleared by the strip.
      expect(after.paymentReference).toBe("GC-ORIGINAL")
    })

    it("still demands payment from a brand-new registration", async () => {
      // The exemption is scoped to the amend. A first-time registrant on the same
      // event must still be held to the required Payment section.
      const event = await db.event.create({
        data: {
          name: "Test Event", type: "OneTime",
          startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01"),
          price: 50000,
          modules: { create: { type: "Priced" } },
          eventFormConfigs: {
            create: { context: "Register", sectionPayment: true, sectionPaymentRequired: true },
          },
        },
        select: { id: true },
      })
      const member = await seedMember()

      const created = await createRegistrant(
        event.id, { ...baseRegistrantInput }, member.id,
        null, undefined, null, undefined, undefined,
        asOwner(member.id)
      )

      expect(created.success).toBe(false)
      if (created.success) throw new Error("expected a refusal")
      expect(created.error).toMatch(/Payment/i)
    })

    it("refuses a grant for somebody else's record", async () => {
      const event = await seedEvent()
      const member = await seedMember()
      const other = await seedMember({ firstName: "Ana", phone: "+639170000002" })

      await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)

      const attempt = await createRegistrant(
        event.id, { ...baseRegistrantInput }, member.id,
        null, undefined, null, undefined, undefined,
        asOwner(other.id)
      )

      expect(attempt.success).toBe(false)
      if (attempt.success) throw new Error("expected a refusal")
      expect(attempt.reason).toBe("alreadyRegistered")
    })

    it("refuses an expired grant", async () => {
      const event = await seedEvent()
      const member = await seedMember()
      await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)

      const stale = signIdentityGrant(
        { recordId: member.id, recordType: "member" },
        Date.now() - 60 * 60 * 1000
      )
      const attempt = await createRegistrant(
        event.id, { ...baseRegistrantInput }, member.id,
        null, undefined, null, undefined, undefined,
        stale
      )

      expect(attempt.success).toBe(false)
    })

    it("ignores a payment reference — money stays with the admin", async () => {
      const event = await db.event.create({
        data: {
          name: "Priced Event", type: "OneTime",
          startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01"),
          price: 100000,
          modules: { create: { type: "Priced" } },
          eventFormConfigs: { create: { context: "Register", sectionPayment: true } },
        },
        select: { id: true },
      })
      const member = await seedMember()

      const first = await createRegistrant(
        event.id,
        { ...baseRegistrantInput, paymentReference: "GCash-ORIGINAL" },
        member.id,
        null
      )
      expect(first.success).toBe(true)
      if (!first.success) return

      await createRegistrant(
        event.id,
        { ...baseRegistrantInput, paymentReference: "GCash-REWRITTEN" },
        member.id,
        null, undefined, null, undefined, ["paymentReference"],
        asOwner(member.id)
      )

      const after = await db.eventRegistrant.findUniqueOrThrow({ where: { id: first.data.id } })
      expect(after.paymentReference).toBe("GCash-ORIGINAL")
    })

    it("is exempt from a registration window that has since closed", async () => {
      // The whole premise is an admin who changed the form after registration shut.
      // Enforcing the window would make the answer uncollectable.
      const event = await db.event.create({
        data: {
          name: "Closed Event", type: "OneTime",
          startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01"),
          registrationStart: new Date("2026-01-01"),
          registrationEnd: new Date("2026-01-31"),
        },
        select: { id: true },
      })
      const member = await seedMember()
      await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

      // A newcomer is still refused.
      const newcomer = await createRegistrant(event.id, { ...baseRegistrantInput }, null)
      expect(newcomer.success).toBe(false)
      if (!newcomer.success) expect(newcomer.error).toMatch(/closed/i)

      const amended = await createRegistrant(
        event.id, { ...baseRegistrantInput }, member.id,
        null, undefined, null, undefined, undefined,
        asOwner(member.id)
      )
      expect(amended.success).toBe(true)
    })

    it("does not raise a second DGroup request", async () => {
      const event = await db.event.create({
        data: {
          name: "Test Event", type: "OneTime",
          startDate: new Date("2026-06-01"), endDate: new Date("2026-06-01"),
          eventFormConfigs: { create: { context: "Register", sectionSmallGroup: true } },
        },
        select: { id: true },
      })
      const member = await seedMember()

      await createRegistrant(
        event.id, { ...baseRegistrantInput, wantsSmallGroup: true }, member.id, null
      )
      await createRegistrant(
        event.id, { ...baseRegistrantInput, wantsSmallGroup: true }, member.id,
        null, undefined, null, undefined, undefined,
        asOwner(member.id)
      )

      expect(await db.smallGroupMemberRequest.count({ where: { memberId: member.id } })).toBe(1)
    })
  })
})
