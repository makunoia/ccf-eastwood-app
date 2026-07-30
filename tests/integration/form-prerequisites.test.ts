import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  clusterFormPrerequisites,
  eventFormPrerequisites,
} from "@/lib/forms/form-prerequisites-server"

/**
 * The builder warnings that stop a form from silently rendering one step short.
 * Each case here corresponds to a real way an enabled toggle produced nothing.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "BreakoutGroupMember", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee", "EventRegistrant", "EventOccurrence", "Event", "Member", "Guest", "LifeStage", "AgeRangeBucket" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
}

async function seedFacilitatorVolunteer(eventId: string) {
  const committee = await db.volunteerCommittee.create({
    data: { name: "Facilitators", eventId },
  })
  const role = await db.committeeRole.create({
    data: { name: "Facilitator", committeeId: committee.id },
  })
  const member = await db.member.create({
    data: { firstName: "Ana", lastName: "Faci", dateJoined: new Date(), language: [] },
  })
  return db.volunteer.create({
    data: {
      memberId: member.id,
      eventId,
      committeeId: committee.id,
      preferredRoleId: role.id,
      status: "Confirmed",
    },
  })
}

describe("eventFormPrerequisites — breakout warnings", () => {
  it("warns that auto-assign means nobody sees the step, on every surface", async () => {
    const event = await seedEvent()
    const result = await eventFormPrerequisites(event.id, true)

    expect(result.sectionBreakout?.message).toContain("Auto-assign is on")
    // Auto-assign suppresses the picker on the public form too, so it isn't scoped.
    expect(result.sectionBreakout?.contexts).toBeUndefined()
  })

  it("warns when the event has no breakout groups at all", async () => {
    const event = await seedEvent()
    const result = await eventFormPrerequisites(event.id, false)

    expect(result.sectionBreakout?.message).toContain("no breakout groups yet")
    expect(result.sectionBreakout?.contexts).toBeUndefined()
  })

  it("warns Walk-in only when groups exist but none has a facilitator", async () => {
    const event = await seedEvent()
    await db.breakoutGroup.create({ data: { name: "One", eventId: event.id } })
    await db.breakoutGroup.create({ data: { name: "Two", eventId: event.id } })

    const result = await eventFormPrerequisites(event.id, false)

    expect(result.sectionBreakout?.message).toContain("2 breakout groups have a facilitator")
    // The public form offers unstaffed groups, so this one is scoped.
    expect(result.sectionBreakout?.contexts).toEqual(["WalkIn"])
  })

  it("uses singular phrasing for a single unstaffed group", async () => {
    const event = await seedEvent()
    await db.breakoutGroup.create({ data: { name: "Only", eventId: event.id } })

    const result = await eventFormPrerequisites(event.id, false)
    expect(result.sectionBreakout?.message).toContain("1 breakout group has a facilitator")
  })

  it("stays quiet once a group is staffed", async () => {
    const event = await seedEvent()
    const volunteer = await seedFacilitatorVolunteer(event.id)
    await db.breakoutGroup.create({
      data: { name: "Staffed", eventId: event.id, facilitatorId: volunteer.id },
    })

    const result = await eventFormPrerequisites(event.id, false)
    expect(result.sectionBreakout).toBeUndefined()
  })

  it("prefers the auto-assign warning over the staffing one", async () => {
    // Both conditions hold; auto-assign is the more decisive fact.
    const event = await seedEvent()
    await db.breakoutGroup.create({ data: { name: "Unstaffed", eventId: event.id } })

    const result = await eventFormPrerequisites(event.id, true)
    expect(result.sectionBreakout?.message).toContain("Auto-assign is on")
  })
})

describe("global field warnings", () => {
  it("warns about missing life stages and age ranges", async () => {
    const event = await seedEvent()
    const result = await eventFormPrerequisites(event.id, false)

    expect(result.fieldLifeStage?.message).toContain("Settings → Life Stages")
    expect(result.fieldAgeRange?.message).toContain("Settings → Age Ranges")
  })

  it("stays quiet once the settings data exists", async () => {
    const event = await seedEvent()
    await db.lifeStage.create({ data: { name: "Singles", order: 1 } })
    await db.ageRangeBucket.create({ data: { label: "18-24", order: 1 } })

    const result = await eventFormPrerequisites(event.id, false)
    expect(result.fieldLifeStage).toBeUndefined()
    expect(result.fieldAgeRange).toBeUndefined()
  })

  it("reaches the cluster form too, which also collects both fields", async () => {
    // Regression: the cluster builder shipped without these warnings even though
    // its form renders the same Life Stage / Age Range inputs.
    const result = await clusterFormPrerequisites()

    expect(result.fieldLifeStage?.message).toContain("Settings → Life Stages")
    expect(result.fieldAgeRange?.message).toContain("Settings → Age Ranges")
    // The cluster form has no breakout picker of its own to warn about.
    expect(result.sectionBreakout).toBeUndefined()
  })
})
