import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  lookupHouseholdForCheckin,
  checkInHousehold,
  addHouseholdMemberAtCheckin,
} from "@/app/(dashboard)/events/actions"

/**
 * Check-in is individual unless the event's Check-in form config turns the
 * Family section on.
 *
 * The regression: the door surfaced the "Anyone else with you?" step whenever
 * the person happened to belong to a Family with someone left to check in —
 * regardless of the config. Belonging to a family is not consent to be asked
 * about it at the kiosk, so every household path is now gated on the section.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Family", "FamilyMember", "Member", "Guest", "EventRegistrant", "Event", "EventFormConfig", "EventOccurrence", "OccurrenceAttendee" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Sunday Service",
      type: "OneTime",
      startDate: new Date("2026-08-02"),
      endDate: new Date("2026-08-02"),
    },
  })
}

/**
 * A family of three, all registered for the event, with the father already
 * checked in — the exact shape that used to force the household prompt.
 */
async function seedHouseholdAtEvent(eventId: string) {
  const family = await db.family.create({ data: { name: "Dela Cruz Family" } })
  const people = [
    { firstName: "Juan", role: "FatherHusband" as const },
    { firstName: "Maria", role: "MotherWife" as const },
    { firstName: "Anna", role: "Child" as const },
  ]

  const registrants: { firstName: string; registrantId: string }[] = []
  for (const person of people) {
    const member = await db.member.create({
      data: {
        firstName: person.firstName,
        lastName: "Dela Cruz",
        dateJoined: new Date(),
        language: [],
      },
    })
    await db.familyMember.create({
      data: { familyId: family.id, memberId: member.id, role: person.role },
    })
    const registrant = await db.eventRegistrant.create({
      data: {
        eventId,
        memberId: member.id,
        attendedAt: person.firstName === "Juan" ? new Date() : null,
      },
      select: { id: true },
    })
    registrants.push({ firstName: person.firstName, registrantId: registrant.id })
  }

  const byName = (name: string) =>
    registrants.find((r) => r.firstName === name)!.registrantId

  return { familyId: family.id, subject: byName("Juan"), others: [byName("Maria"), byName("Anna")] }
}

async function setFamilyCheckin(eventId: string, on: boolean) {
  await db.eventFormConfig.create({
    data: { eventId, context: "CheckIn", sectionFamily: on },
  })
}

describe("Family check-in is opt-in per event", () => {
  it("hides the household when the Check-in config has no Family section at all", async () => {
    const event = await seedEvent()
    const { subject } = await seedHouseholdAtEvent(event.id)

    const result = await lookupHouseholdForCheckin(event.id, subject, null)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toBeNull()
  })

  it("hides the household even when relatives are still pending check-in", async () => {
    const event = await seedEvent()
    await setFamilyCheckin(event.id, false)
    const { subject, others } = await seedHouseholdAtEvent(event.id)

    const result = await lookupHouseholdForCheckin(event.id, subject, null)

    expect(result.success).toBe(true)
    if (!result.success) return
    // This is the regression: two relatives are registered and un-checked-in,
    // which used to be enough to force the prompt on its own.
    expect(result.data).toBeNull()
    const pending = await db.eventRegistrant.count({
      where: { id: { in: others }, attendedAt: null },
    })
    expect(pending).toBe(2)
  })

  it("refuses a household check-in when the section is off", async () => {
    const event = await seedEvent()
    await setFamilyCheckin(event.id, false)
    const { others } = await seedHouseholdAtEvent(event.id)

    const result = await checkInHousehold(event.id, others, null)

    expect(result.success).toBe(false)
    // Nobody was checked in behind the config's back.
    expect(
      await db.eventRegistrant.count({ where: { id: { in: others }, attendedAt: { not: null } } })
    ).toBe(0)
  })

  it("refuses to add a family member at the door when the section is off", async () => {
    const event = await seedEvent()
    await setFamilyCheckin(event.id, false)
    const { subject, familyId } = await seedHouseholdAtEvent(event.id)

    const result = await addHouseholdMemberAtCheckin(
      event.id,
      subject,
      { firstName: "Lolo", lastName: "Dela Cruz", role: "Other" },
      null
    )

    expect(result.success).toBe(false)
    expect(await db.familyMember.count({ where: { familyId } })).toBe(3)
  })

  it("surfaces and checks in the household once the section is on", async () => {
    const event = await seedEvent()
    await setFamilyCheckin(event.id, true)
    const { subject, others } = await seedHouseholdAtEvent(event.id)

    const lookup = await lookupHouseholdForCheckin(event.id, subject, null)
    expect(lookup.success).toBe(true)
    if (!lookup.success) return
    expect(lookup.data?.familyName).toBe("Dela Cruz Family")
    expect(lookup.data?.members).toHaveLength(3)
    // The person at the kiosk sorts first and is flagged as the subject.
    expect(lookup.data?.members[0]?.isSubject).toBe(true)

    const result = await checkInHousehold(event.id, others, null)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.checkedIn).toBe(2)
    expect(
      await db.eventRegistrant.count({ where: { id: { in: others }, attendedAt: { not: null } } })
    ).toBe(2)
  })
})
