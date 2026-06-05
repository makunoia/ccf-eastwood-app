import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { importEventRegistrants } from "@/app/(event)/event/[id]/registrants/import-actions"
import { getEventRegistrantFields } from "@/lib/import/field-definitions"

afterAll(async () => {
  await db.$disconnect()
})

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "EventRegistrant", "Event", "Guest", "SchedulePreference", "Member"
    RESTART IDENTITY CASCADE`
})

async function seedEvent(overrides: { formIncludePayment?: boolean } = {}) {
  return db.event.create({
    data: {
      name: "Encounter Weekend",
      type: "OneTime",
      startDate: new Date("2026-06-01T00:00:00Z"),
      endDate: new Date("2026-06-01T00:00:00Z"),
      formIncludePayment: overrides.formIncludePayment ?? false,
    },
    select: { id: true },
  })
}

describe("getEventRegistrantFields", () => {
  it("includes gender and birth fields by default, without payment reference", () => {
    expect(getEventRegistrantFields().map((field) => field.key)).toEqual([
      "firstName",
      "lastName",
      "email",
      "mobileNumber",
      "nickname",
      "gender",
      "birthMonth",
      "birthYear",
    ])
  })

  it("adds payment reference only when enabled", () => {
    expect(getEventRegistrantFields({ includePaymentReference: true }).at(-1)?.key).toBe("paymentReference")
  })
})

describe("importEventRegistrants", () => {
  it("creates a guest with imported gender and birth fields", async () => {
    const event = await seedEvent()

    const result = await importEventRegistrants(event.id, [
      {
        mapped: {
          firstName: "ana",
          lastName: "lopez",
          email: "ana@example.com",
          mobileNumber: "09171234567",
          gender: "Female",
          birthMonth: "February",
          birthYear: "1998",
        },
        resolution: "use-existing",
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.created).toBe(1)

    const guest = await db.guest.findFirst({
      where: { email: "ana@example.com" },
      select: {
        firstName: true,
        lastName: true,
        gender: true,
        birthMonth: true,
        birthYear: true,
      },
    })

    expect(guest).toMatchObject({
      firstName: "Ana",
      lastName: "Lopez",
      gender: "Female",
      birthMonth: 2,
      birthYear: 1998,
    })
  })

  it("marks a registrant paid from payment reference only when the setting is enabled", async () => {
    const enabledEvent = await seedEvent({ formIncludePayment: true })

    const enabledResult = await importEventRegistrants(enabledEvent.id, [
      {
        mapped: {
          firstName: "Juan",
          lastName: "Dela Cruz",
          email: "juan@example.com",
          paymentReference: "GCASH-123",
        },
        resolution: "use-existing",
      },
    ])

    expect(enabledResult.success).toBe(true)
    const enabledRegistrant = await db.eventRegistrant.findFirst({
      where: { eventId: enabledEvent.id },
      select: { isPaid: true, paymentReference: true },
    })
    expect(enabledRegistrant).toMatchObject({
      isPaid: true,
      paymentReference: "GCASH-123",
    })

    const disabledEvent = await seedEvent({ formIncludePayment: false })
    const disabledResult = await importEventRegistrants(disabledEvent.id, [
      {
        mapped: {
          firstName: "Maria",
          lastName: "Santos",
          email: "maria@example.com",
          paymentReference: "GCASH-999",
        },
        resolution: "use-existing",
      },
    ])

    expect(disabledResult.success).toBe(true)
    const disabledRegistrant = await db.eventRegistrant.findFirst({
      where: { eventId: disabledEvent.id },
      select: { isPaid: true, paymentReference: true },
    })
    expect(disabledRegistrant).toMatchObject({
      isPaid: false,
      paymentReference: null,
    })
  })

  it("updates matched members with imported gender and birth fields when using CSV data", async () => {
    const event = await seedEvent()
    const member = await db.member.create({
      data: {
        firstName: "Mark",
        lastName: "Reyes",
        dateJoined: new Date(),
        language: [],
        email: "mark@example.com",
      },
      select: { id: true },
    })

    const result = await importEventRegistrants(event.id, [
      {
        mapped: {
          firstName: "Mark",
          lastName: "Reyes",
          email: "mark@example.com",
          gender: "Male",
          birthMonth: "11",
          birthYear: "1990",
        },
        resolution: "use-csv",
        existingId: member.id,
        existingType: "member",
      },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return

    const updatedMember = await db.member.findUnique({
      where: { id: member.id },
      select: { gender: true, birthMonth: true, birthYear: true },
    })
    expect(updatedMember).toMatchObject({
      gender: "Male",
      birthMonth: 11,
      birthYear: 1990,
    })
  })
})
