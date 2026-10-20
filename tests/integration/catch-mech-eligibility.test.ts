import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { eligibleCatchMechRegistrantIds } from "@/lib/catch-mech/eligibility"
import { getSessionData } from "@/app/events/[id]/catch-mech/[token]/page"
import { createSmallGroupForTimothy, submitCatchMechConfirmations } from "@/app/events/[id]/catch-mech/actions"
import { searchCatchMechVolunteerParticipants, submitCatchMechVolunteerPlacements } from "@/app/events/[id]/catch-mech/volunteers/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "SmallGroup", "Member", "Guest" RESTART IDENTITY CASCADE`
})
afterAll(async () => { await db.$disconnect() })

async function seed(type: "Recurring" | "MultiDay" | "OneTime" = "Recurring") {
  const event = await db.event.create({ data: { name: "Eligibility", type, startDate: new Date("2026-01-01"), endDate: new Date("2026-01-02"), modules: { create: { type: "CatchMech" } } } })
  const member = await db.member.create({ data: { firstName: "Lead", lastName: "Faci", language: [], dateJoined: new Date() } })
  const group = await db.smallGroup.create({ data: { name: "Lead's DGroup", leaderId: member.id } })
  const committee = await db.volunteerCommittee.create({ data: { name: "Team", eventId: event.id } })
  const role = await db.committeeRole.create({ data: { name: "Host", committeeId: committee.id } })
  const volunteer = await db.volunteer.create({ data: { memberId: member.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" } })
  const breakout = await db.breakoutGroup.create({ data: { eventId: event.id, name: "Table", facilitatorId: volunteer.id } })
  const session = await db.catchMechSession.create({ data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: volunteer.id } })
  const volunteerSession = await db.catchMechVolunteerSession.create({ data: { eventId: event.id, volunteerId: volunteer.id } })
  const guest = await db.guest.create({ data: { firstName: "Returnee", lastName: "Guest", language: [] } })
  const registrant = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
  await db.breakoutGroupMember.create({ data: { breakoutGroupId: breakout.id, registrantId: registrant.id } })
  const sessions = await Promise.all(["2026-01-01", "2026-01-02"].map((date) => db.eventOccurrence.create({ data: { eventId: event.id, date: new Date(date) } })))
  async function attend(index: number, id = registrant.id) { await db.occurrenceAttendee.create({ data: { occurrenceId: sessions[index].id, registrantId: id } }) }
  return { event, member, group, volunteer, breakout, session, volunteerSession, guest, registrant, sessions, attend }
}

describe("public Catch Mech eligibility", () => {
  it.each(["Recurring", "MultiDay"] as const)("requires two distinct participant visits for %s, including visits spread over duplicates", async (type) => {
    const s = await seed(type)
    expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set())
    await s.attend(0)
    await db.occurrenceAttendee.updateMany({ data: { isReturnerOverride: true } })
    expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set())
    const duplicate = await db.eventRegistrant.create({ data: { eventId: s.event.id, guestId: s.guest.id } })
    await s.attend(0, duplicate.id)
    expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set())
    await s.attend(1, duplicate.id)
    expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set([s.registrant.id, duplicate.id]))
    expect((await getSessionData(s.session.token))?.rows).toHaveLength(1)
    const search = await searchCatchMechVolunteerParticipants(s.volunteerSession.token, "Returnee")
    expect(search.success && search.data).toHaveLength(1)
  })
  it("requires attendance on OneTime events but exempts the two-session threshold", async () => {
    const s = await seed("OneTime")
    expect((await getSessionData(s.session.token))?.rows).toHaveLength(0)
    await db.eventRegistrant.update({ where: { id: s.registrant.id }, data: { attendedAt: new Date() } })
    expect((await getSessionData(s.session.token))?.rows).toHaveLength(1)
  })
  it("excludes self-reported local/external groups and pending assignments, while keeping groupless interest eligible", async () => {
    const s = await seed()
    await s.attend(0); await s.attend(1)
    for (const claim of [{ claimedSmallGroupId: s.group.id, claimedSatellite: null }, { claimedSmallGroupId: null, claimedSatellite: "CCF Pasig" }]) {
      await db.guest.update({ where: { id: s.guest.id }, data: claim })
      expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set())
    }
    await db.guest.update({ where: { id: s.guest.id }, data: { claimedSatellite: null } })
    const request = await db.smallGroupMemberRequest.create({ data: { guestId: s.guest.id, origin: "RegistrationIntent", sourceEventId: s.event.id } })
    expect((await eligibleCatchMechRegistrantIds(s.event.id)).has(s.registrant.id)).toBe(true)
    await db.smallGroupMemberRequest.update({ where: { id: request.id }, data: { smallGroupId: s.group.id, origin: "Assignment" } })
    expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set())
  })
  it("excludes members with confirmed, reported external, or pending local DGroups", async () => {
    const s = await seed()
    const person = await db.member.create({ data: { firstName: "Returnee", lastName: "Member", dateJoined: new Date(), language: [] } })
    await db.eventRegistrant.update({ where: { id: s.registrant.id }, data: { memberId: person.id, guestId: null } })
    await s.attend(0); await s.attend(1)
    expect((await eligibleCatchMechRegistrantIds(s.event.id)).has(s.registrant.id)).toBe(true)
    for (const data of [{ smallGroupId: s.group.id, upwardSatellite: null }, { smallGroupId: null, upwardSatellite: "CCF Pasig" }]) {
      await db.member.update({ where: { id: person.id }, data })
      expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set())
    }
    await db.member.update({ where: { id: person.id }, data: { upwardSatellite: null } })
    await db.smallGroupMemberRequest.create({ data: { memberId: person.id, smallGroupId: s.group.id } })
    expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set())
  })
  it("rejects stale selections through facilitator, volunteer, and Timothy writes without creating a group", async () => {
    const s = await seed()
    await s.attend(0); await s.attend(1)
    expect((await getSessionData(s.session.token))?.rows).toHaveLength(1)
    await db.guest.update({ where: { id: s.guest.id }, data: { claimedSmallGroupId: s.group.id } })
    const decision = { registrantId: s.registrant.id, status: "confirmed" as const }
    const result = await submitCatchMechConfirmations(s.session.token, [decision])
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("no longer eligible") })
    expect((await submitCatchMechVolunteerPlacements(s.volunteerSession.token, [{ registrantId: s.registrant.id, smallGroupId: s.group.id }])).success).toBe(false)
    await db.smallGroup.update({ where: { id: s.group.id }, data: { leader: { create: { firstName: "Other", lastName: "Leader", dateJoined: new Date(), language: [] } } } })
    expect((await createSmallGroupForTimothy(s.session.token, "Must not exist", [decision])).success).toBe(false)
    expect(await db.smallGroup.count({ where: { name: "Must not exist" } })).toBe(0)
  })
  it("does not count volunteer attendance or another event's participant visits", async () => {
    const s = await seed()
    await s.attend(0)
    await db.occurrenceAttendee.create({ data: { occurrenceId: s.sessions[1].id, volunteerId: s.volunteer.id } })
    const other = await db.event.create({ data: { name: "Other", type: "OneTime", startDate: new Date(), endDate: new Date() } })
    await db.eventRegistrant.create({ data: { eventId: other.id, guestId: s.guest.id, attendedAt: new Date() } })
    expect(await eligibleCatchMechRegistrantIds(s.event.id)).toEqual(new Set())
  })
})

it.each(["facilitator", "Timothy", "volunteer"])("%s confirmation resolves the original groupless interest and preserves its source event", async (surface) => {
  const s = await seed()
  await s.attend(0); await s.attend(1)
  const source = await db.event.create({ data: { name: "Original signup event", type: "OneTime", startDate: new Date(), endDate: new Date() } })
  const interest = await db.smallGroupMemberRequest.create({ data: { guestId: s.guest.id, origin: "RegistrationIntent", sourceEventId: source.id } })
  let result: { success: boolean }
  if (surface === "volunteer") {
    result = await submitCatchMechVolunteerPlacements(s.volunteerSession.token, [{ registrantId: s.registrant.id, smallGroupId: s.group.id }])
  } else if (surface === "Timothy") {
    await db.smallGroup.update({ where: { id: s.group.id }, data: { leader: { create: { firstName: "Other", lastName: "Leader", language: [], dateJoined: new Date() } } } })
    result = await createSmallGroupForTimothy(s.session.token, "New follow-up group", [{ registrantId: s.registrant.id, status: "confirmed" }])
  } else result = await submitCatchMechConfirmations(s.session.token, [{ registrantId: s.registrant.id, status: "confirmed" }])
  expect(result.success).toBe(true)
  const updated = await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: interest.id } })
  expect(updated).toMatchObject({ origin: "Assignment", status: "Confirmed", guestId: null, sourceEventId: source.id })
  expect(updated.memberId).not.toBeNull()
  expect(updated.smallGroupId).not.toBeNull()
  expect(await db.smallGroupMemberRequest.count()).toBe(1)
})

it("keeps groupless interest open when a facilitator declines that person", async () => {
  const s = await seed()
  await s.attend(0); await s.attend(1)
  const interest = await db.smallGroupMemberRequest.create({ data: { guestId: s.guest.id, origin: "RegistrationIntent", sourceEventId: s.event.id } })
  expect((await submitCatchMechConfirmations(s.session.token, [{ registrantId: s.registrant.id, status: "declined", declineReason: "NotInterested" }])).success).toBe(true)
  expect(await db.smallGroupMemberRequest.findUniqueOrThrow({ where: { id: interest.id } })).toMatchObject({ status: "Pending", smallGroupId: null })
})

it("shows a duplicated seated person only once to the facilitator", async () => {
  const s = await seed()
  await s.attend(0); await s.attend(1)
  const duplicate = await db.eventRegistrant.create({ data: { eventId: s.event.id, guestId: s.guest.id } })
  await db.breakoutGroupMember.create({ data: { breakoutGroupId: s.breakout.id, registrantId: duplicate.id } })
  expect((await getSessionData(s.session.token))?.rows).toHaveLength(1)
})

it("concurrent public confirmations place a guest only once", async () => {
  const s = await seed()
  await s.attend(0); await s.attend(1)
  const outcomes = await Promise.all([1, 2].map(() => submitCatchMechConfirmations(s.session.token, [{ registrantId: s.registrant.id, status: "confirmed" }])))
  expect(outcomes.filter((result) => result.success)).toHaveLength(1)
  expect(await db.member.count({ where: { firstName: s.guest.firstName, lastName: s.guest.lastName } })).toBe(1)
  const registrant = await db.eventRegistrant.findUniqueOrThrow({ where: { id: s.registrant.id } })
  const guest = await db.guest.findUniqueOrThrow({ where: { id: s.guest.id } })
  expect(registrant.memberId).toBe(guest.memberId)
  expect(await db.smallGroupMemberRequest.count({ where: { status: "Confirmed" } })).toBe(1)
})
