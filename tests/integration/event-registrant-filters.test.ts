import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import { getEventRegistrants } from "@/app/(event)/event/[id]/registrants/page"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "OccurrenceAttendee", "EventOccurrence", "EventRegistrant", "Event",
    "Guest", "Member", "LifeStage", "AgeRangeBucket"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Registrant filters",
      type: "Recurring",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
    },
  })
}

describe("event registrant profile filters", () => {
  it("filters member and guest registrants by life stage and gender", async () => {
    const event = await seedEvent()
    const stage = await db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
    const member = await db.member.create({
      data: { firstName: "Mia", lastName: "Member", dateJoined: new Date(), language: [], lifeStageId: stage.id, gender: "Female", meetingPreference: "Online" },
    })
    const guest = await db.guest.create({
      data: { firstName: "Sam", lastName: "Guest", lifeStageId: stage.id, gender: "Male", meetingPreference: "InPerson", language: [] },
    })
    const other = await db.guest.create({ data: { firstName: "Alex", lastName: "Other", language: [] } })
    const memberRegistration = await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    const guestRegistration = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: other.id } })

    const rows = await getEventRegistrants(event.id, "", "", "", "", stage.id, "Male", "", "")

    expect(rows?.registrants.map((row) => row.id)).toEqual([guestRegistration.id])
    expect(rows?.registrants).not.toContainEqual(expect.objectContaining({ id: memberRegistration.id }))

    const inPersonRows = await getEventRegistrants(event.id, "", "", "", "", "", "", "", "InPerson")
    expect(inPersonRows?.registrants.map((row) => row.id)).toEqual([guestRegistration.id])
  })

  it("matches age ranges from a saved bucket or birth year", async () => {
    const event = await seedEvent()
    const adultRange = await db.ageRangeBucket.create({
      data: { label: "18–35", minAge: 18, maxAge: 35, order: 1 },
    })
    const savedBucketGuest = await db.guest.create({
      data: { firstName: "Bucket", lastName: "Guest", ageRangeBucketId: adultRange.id, language: [] },
    })
    const birthYearMember = await db.member.create({
      data: { firstName: "Year", lastName: "Member", birthYear: new Date().getUTCFullYear() - 25, dateJoined: new Date(), language: [] },
    })
    const childGuest = await db.guest.create({
      data: { firstName: "Child", lastName: "Guest", birthYear: new Date().getUTCFullYear() - 10, language: [] },
    })
    const savedRegistration = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: savedBucketGuest.id } })
    const birthYearRegistration = await db.eventRegistrant.create({ data: { eventId: event.id, memberId: birthYearMember.id } })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: childGuest.id } })

    const rows = await getEventRegistrants(event.id, "", "", "", "", "", "", adultRange.id, "")

    expect(rows?.registrants.map((row) => row.id)).toEqual([savedRegistration.id, birthYearRegistration.id])
  })

  it("filters payment and both one-time and occurrence attendance", async () => {
    const event = await seedEvent()
    const paid = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Paid", lastName: "Guest", isPaid: true },
    })
    const occurrence = await db.eventOccurrence.create({ data: { eventId: event.id, date: new Date("2026-09-24T00:00:00Z") } })
    const checkedIn = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Checked", lastName: "In" },
    })
    await db.occurrenceAttendee.create({ data: { occurrenceId: occurrence.id, registrantId: checkedIn.id } })
    const absent = await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Not", lastName: "Here" },
    })

    const paidRows = await getEventRegistrants(event.id, "", "", "paid", "", "", "", "", "")
    const attendedRows = await getEventRegistrants(event.id, "", "", "", "attended", "", "", "", "")
    const absentRows = await getEventRegistrants(event.id, "", "", "", "not-attended", "", "", "", "")

    expect(paidRows?.registrants.map((row) => row.id)).toEqual([paid.id])
    expect(attendedRows?.registrants.map((row) => row.id)).toEqual([checkedIn.id])
    expect(absentRows?.registrants.map((row) => row.id)).toEqual([paid.id, absent.id])
  })
})
