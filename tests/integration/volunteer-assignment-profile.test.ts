import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createEventVolunteer, updateEventVolunteer } from "@/app/(event)/event/[id]/volunteers/[volunteerId]/actions"
import { setFacilitator } from "@/app/(dashboard)/events/breakout-actions"
import { updateVolunteer } from "@/app/(dashboard)/volunteers/actions"
import { importVolunteers } from "@/app/(dashboard)/volunteers/import-actions"
import { submitVolunteerSignUp } from "@/app/volunteers/sign-up-actions"
import { eventSurface } from "@/lib/breakouts/owner"
import { db } from "@/lib/db"

describe("event volunteer assignment profile", () => {
  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "Member", "LifeStage" RESTART IDENTITY CASCADE`
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it("persists an age group and life stage for breakout assignment filters", async () => {
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
    const member = await db.member.create({
      data: { firstName: "Mika", lastName: "Reyes", language: [], dateJoined: new Date() },
    })
    const event = await db.event.create({
      data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const committee = await db.volunteerCommittee.create({ data: { name: "Hosts", eventId: event.id } })
    const role = await db.committeeRole.create({ data: { name: "Facilitator", committeeId: committee.id } })
    const created = await createEventVolunteer({
      memberId: member.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      ageGroup: "25–34",
      lifeStageId: lifeStage.id,
      notes: "",
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    const result = await updateEventVolunteer(created.data.id, event.id, {
      memberId: member.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      assignedRoleId: "",
      ageGroup: "35–49",
      lifeStageId: lifeStage.id,
      status: "Confirmed",
      notes: "",
    })

    expect(result.success).toBe(true)
    await expect(db.volunteer.findUniqueOrThrow({ where: { id: created.data.id } })).resolves.toMatchObject({
      ageGroup: "35–49",
      lifeStageId: lifeStage.id,
    })
  })

  it("rejects a pending volunteer from a breakout facilitator slot", async () => {
    const member = await db.member.create({
      data: { firstName: "Noel", lastName: "Pending", language: [], dateJoined: new Date() },
    })
    const event = await db.event.create({
      data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const committee = await db.volunteerCommittee.create({ data: { name: "Hosts", eventId: event.id } })
    const role = await db.committeeRole.create({ data: { name: "Facilitator", committeeId: committee.id } })
    const volunteer = await db.volunteer.create({
      data: { memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id },
    })
    const group = await db.breakoutGroup.create({ data: { name: "Table 1", eventId: event.id, language: [] } })

    const result = await setFacilitator(group.id, volunteer.id, "facilitator", eventSurface(event.id).owner)

    expect(result).toEqual({ success: false, error: "Volunteer not found for this event" })
    await expect(db.breakoutGroup.findUniqueOrThrow({ where: { id: group.id } })).resolves.toMatchObject({ facilitatorId: null })
  })

  it("persists the assignment profile through the dashboard volunteer workflow", async () => {
    const lifeStage = await db.lifeStage.create({ data: { name: "Families", order: 1 } })
    const member = await db.member.create({
      data: { firstName: "Dina", lastName: "Santos", language: [], dateJoined: new Date() },
    })
    const event = await db.event.create({
      data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const committee = await db.volunteerCommittee.create({ data: { name: "Hosts", eventId: event.id } })
    const role = await db.committeeRole.create({ data: { name: "Facilitator", committeeId: committee.id } })
    const volunteer = await db.volunteer.create({
      data: { memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id },
    })

    await expect(updateVolunteer(volunteer.id, {
      memberId: member.id,
      eventId: event.id,
      committeeId: committee.id,
      preferredRoleId: role.id,
      assignedRoleId: "",
      ageGroup: "35–49",
      lifeStageId: lifeStage.id,
      status: "Confirmed",
      notes: "",
    })).resolves.toMatchObject({ success: true })

    await expect(db.volunteer.findUniqueOrThrow({ where: { id: volunteer.id } })).resolves.toMatchObject({
      ageGroup: "35–49",
      lifeStageId: lifeStage.id,
    })
  })

  it("imports the supplied assignment profile", async () => {
    const lifeStage = await db.lifeStage.create({ data: { name: "Families", order: 1 } })
    const event = await db.event.create({
      data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const committee = await db.volunteerCommittee.create({ data: { name: "Hosts", eventId: event.id } })
    await db.committeeRole.create({ data: { name: "Facilitator", committeeId: committee.id } })

    await expect(importVolunteers({ eventId: event.id }, [{
      mapped: {
        firstName: "Ana", lastName: "Cruz", committeeName: "Hosts", roleName: "Facilitator",
        ageGroup: "35–49", lifeStage: "Families",
      },
      resolution: "use-csv",
    }])).resolves.toMatchObject({ success: true, data: { created: 1, skipped: 0 } })

    await expect(db.volunteer.findFirstOrThrow({ where: { eventId: event.id } })).resolves.toMatchObject({
      ageGroup: "35–49",
      lifeStageId: lifeStage.id,
    })
  })

  it("does not import a second event volunteer when only the committee differs", async () => {
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Cruz", language: [], dateJoined: new Date() },
    })
    const event = await db.event.create({
      data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const firstCommittee = await db.volunteerCommittee.create({ data: { name: "Hosts", eventId: event.id } })
    const firstRole = await db.committeeRole.create({ data: { name: "Usher", committeeId: firstCommittee.id } })
    const secondCommittee = await db.volunteerCommittee.create({ data: { name: "Welcome", eventId: event.id } })
    await db.committeeRole.create({ data: { name: "Greeter", committeeId: secondCommittee.id } })
    await db.volunteer.create({
      data: { memberId: member.id, eventId: event.id, committeeId: firstCommittee.id, preferredRoleId: firstRole.id },
    })

    await expect(importVolunteers({ eventId: event.id }, [{
      mapped: {
        firstName: member.firstName,
        lastName: member.lastName,
        committeeName: "Welcome",
        roleName: "Greeter",
      },
      resolution: "use-existing",
      existingId: member.id,
    }])).resolves.toMatchObject({ success: true, data: { created: 0, skipped: 1 } })

    await expect(db.volunteer.count({ where: { memberId: member.id, eventId: event.id } })).resolves.toBe(1)
  })

  it("derives the profile when a member signs up publicly", async () => {
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
    const member = await db.member.create({
      data: { firstName: "Lia", lastName: "Tan", language: [], dateJoined: new Date(), birthYear: 1998, lifeStageId: lifeStage.id },
    })
    const event = await db.event.create({
      data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const committee = await db.volunteerCommittee.create({ data: { name: "Hosts", eventId: event.id } })
    const role = await db.committeeRole.create({ data: { name: "Facilitator", committeeId: committee.id } })

    await expect(submitVolunteerSignUp({
      memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, notes: "",
    })).resolves.toMatchObject({ success: true })

    await expect(db.volunteer.findFirstOrThrow({ where: { eventId: event.id } })).resolves.toMatchObject({
      ageGroup: "25–34",
      lifeStageId: lifeStage.id,
    })
  })

  it("rejects a committee and role from another event", async () => {
    const member = await db.member.create({
      data: { firstName: "Ivy", lastName: "Lim", language: [], dateJoined: new Date() },
    })
    const [event, otherEvent] = await Promise.all([
      db.event.create({ data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() } }),
      db.event.create({ data: { name: "Other", type: "OneTime", startDate: new Date(), endDate: new Date() } }),
    ])
    const committee = await db.volunteerCommittee.create({ data: { name: "Hosts", eventId: otherEvent.id } })
    const role = await db.committeeRole.create({ data: { name: "Facilitator", committeeId: committee.id } })

    await expect(createEventVolunteer({
      memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id,
      ageGroup: "", lifeStageId: "", notes: "",
    })).resolves.toEqual({ success: false, error: "Committee and preferred role must belong to this event." })
  })
})
