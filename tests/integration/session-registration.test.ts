import { beforeEach, afterAll, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant, checkInToOccurrence, lookupCheckinRegistrant } from "@/app/(dashboard)/events/actions"
import { registerForCluster, lookupClusterCheckin } from "@/app/(dashboard)/events/cluster-actions"
import { setSessionRegistration } from "@/app/(dashboard)/events/form-config-actions"
import { latestActiveSession } from "@/lib/events/walk-in-session"
import { registrationSessionTargets, assertSessionTarget } from "@/lib/events/session-registration"
import { getSessionsAttendanceExport } from "@/app/(event)/event/[id]/sessions/export-actions"
import { getClusterDayRows, getClusterEvents } from "@/lib/clusters/aggregate"
import { breakoutSessionRegistrationKeys } from "@/lib/breakouts/session-registration"
import { getCheckinBreakoutChoices } from "@/app/(dashboard)/events/breakout-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "Member", "Guest", "LifeStage", "EventCluster" RESTART IDENTITY CASCADE`
})
afterAll(async () => { await db.$disconnect() })

async function seed(type: "Recurring" | "MultiDay" = "Recurring") {
  const event = await db.event.create({ data: { name: "Sunday", type, startDate: new Date("2026-10-04"), endDate: new Date("2026-10-11"), sessionRegistrationEnabled: true, walkInSessionMode: "Latest", modules: { create: { type: "Breakout" } } } })
  const occurrence = await db.eventOccurrence.create({ data: { eventId: event.id, date: new Date("2026-10-04"), isOpen: false, createdAt: new Date("2026-09-30") } })
  const member = await db.member.create({ data: { firstName: "Maria", lastName: "Santos", phone: "+63 917 123 4567", dateJoined: new Date(), language: [] } })
  const committee = await db.volunteerCommittee.create({ data: { eventId: event.id, name: "Team" } })
  const role = await db.committeeRole.create({ data: { committeeId: committee.id, name: "Helper" } })
  return { event, occurrence, member, committee, role }
}
const payload = { firstName: "Maria", lastName: "Santos", mobileNumber: "+63 917 123 4567" }
const input = (eventId: string, occurrenceId: string) => ({ ...payload, sessionOccurrenceIds: { [eventId]: occurrenceId } })

async function volunteer(seedData: Awaited<ReturnType<typeof seed>>) {
  return db.volunteer.create({ data: { memberId: seedData.member.id, eventId: seedData.event.id, committeeId: seedData.committee.id, preferredRoleId: seedData.role.id, status: "Confirmed" } })
}

describe("session registration", () => {
  it.each(["Recurring", "MultiDay"] as const)("creates a session registration for a closed %s session without attendance and reuses it", async (type) => {
    const { event, occurrence, member } = await seed(type)
    const first = await createRegistrant(event.id, input(event.id, occurrence.id), member.id)
    expect(first.success).toBe(true)
    if (!first.success) return
    expect(first.data.alreadyRegisteredForSession).toBe(false)
    const again = await createRegistrant(event.id, input(event.id, occurrence.id), member.id)
    expect(again.success && again.data.alreadyRegisteredForSession).toBe(true)
    expect(await db.eventRegistrant.count()).toBe(1)
    expect(await db.sessionRegistration.count()).toBe(1)
    expect(await db.occurrenceAttendee.count()).toBe(0)
  })
  it("deduplicates concurrent confirmations in one series registration", async () => {
    const { event, occurrence, member } = await seed()
    const results = await Promise.all([
      createRegistrant(event.id, input(event.id, occurrence.id), member.id),
      createRegistrant(event.id, input(event.id, occurrence.id), member.id),
    ])
    expect(results.every((r) => r.success)).toBe(true)
    expect(await db.eventRegistrant.count()).toBe(1)
    expect(await db.sessionRegistration.count()).toBe(1)
  })
  it("rolls registration back if the target fails transaction validation", async () => {
    const { event, occurrence, member } = await seed()
    await expect(db.$transaction(async (tx) => {
      await tx.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
      await assertSessionTarget(tx, event.id, "another-events-session")
    })).rejects.toThrow("session has changed")
    expect(await db.eventRegistrant.count()).toBe(0)
    expect(await db.sessionRegistration.count()).toBe(0)
    expect(occurrence.id).toBeTruthy()
  })
  it("adds session registration to an existing registration without changing its payment", async () => {
    const { event, occurrence, member } = await seed()
    const held = await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id, paymentReference: "original" } })
    const result = await createRegistrant(event.id, { ...input(event.id, occurrence.id), paymentReference: "replacement" }, member.id)
    expect(result.success && result.data.id).toBe(held.id)
    expect((await db.eventRegistrant.findUniqueOrThrow({ where: { id: held.id } })).paymentReference).toBe("original")
  })
  it("reuses an anonymous returning guest", async () => {
    const { event, occurrence } = await seed()
    const raw = { ...input(event.id, occurrence.id), mobileNumber: "+63 918 111 2222", firstName: "Guest" }
    expect((await createRegistrant(event.id, raw, null)).success).toBe(true)
    expect((await createRegistrant(event.id, raw, null)).success).toBe(true)
    expect(await db.guest.count()).toBe(1)
    expect(await db.sessionRegistration.count()).toBe(1)
  })
  it("rejects stale, missing, deleted and foreign session targets before creating registration", async () => {
    const { event, occurrence, member } = await seed()
    const latest = await db.eventOccurrence.create({ data: { eventId: event.id, date: new Date("2026-10-11") } })
    for (const target of [occurrence.id, "foreign", null]) {
      const result = await createRegistrant(event.id, { ...payload, sessionOccurrenceIds: { [event.id]: target } }, member.id)
      expect(!result.success && result.reason).toBe("sessionChanged")
    }
    expect(await db.eventRegistrant.count()).toBe(0)
    expect((await latestActiveSession(event.id))?.id).toBe(latest.id)
    await db.eventOccurrence.deleteMany({ where: { eventId: event.id } })
    expect((await createRegistrant(event.id, input(event.id, latest.id), member.id)).success).toBe(false)
  })
  it("orders latest by creation time, date and ID and never moves earlier session registrations", async () => {
    const { event, occurrence, member } = await seed()
    await createRegistrant(event.id, input(event.id, occurrence.id), member.id)
    const date = new Date("2026-10-11")
    const createdAt = new Date("2026-10-01")
    await db.eventOccurrence.create({ data: { id: "tie-a", eventId: event.id, date, createdAt } })
    await db.eventOccurrence.create({ data: { id: "tie-z", eventId: event.id, date: new Date("2026-10-12"), createdAt } })
    expect((await latestActiveSession(event.id))?.id).toBe("tie-z")
    expect((await db.sessionRegistration.findFirstOrThrow()).occurrenceId).toBe(occurrence.id)
  })
  it("keeps the old duplicate and volunteer guards when session registration is disabled", async () => {
    const data = await seed()
    await db.event.update({ where: { id: data.event.id }, data: { sessionRegistrationEnabled: false } })
    await db.eventRegistrant.create({ data: { eventId: data.event.id, memberId: data.member.id } })
    const duplicate = await createRegistrant(data.event.id, payload, data.member.id)
    expect(!duplicate.success && duplicate.reason).toBe("alreadyRegistered")
    await volunteer(data)
    expect((await createRegistrant(data.event.id, { ...payload, registerAsParticipant: true }, data.member.id)).success).toBe(false)
  })
  it("requires explicit participant intent and preserves volunteer assignments", async () => {
    const data = await seed()
    const serving = await volunteer(data)
    expect((await createRegistrant(data.event.id, input(data.event.id, data.occurrence.id), data.member.id)).success).toBe(false)
    const registered = await createRegistrant(data.event.id, { ...input(data.event.id, data.occurrence.id), registerAsParticipant: true }, data.member.id)
    expect(registered.success).toBe(true)
    expect(await db.volunteer.findUnique({ where: { id: serving.id } })).toMatchObject({ status: "Confirmed", preferredRoleId: data.role.id })
    const lookup = await lookupCheckinRegistrant(data.event.id, data.member.phone!, data.occurrence.id)
    expect(lookup.success && lookup.data && "kind" in lookup.data && lookup.data.kind).toBe("registrant")
  })
  it("converts existing serving attendance without changing its timestamp and keeps other sessions serving", async () => {
    const data = await seed()
    const serving = await volunteer(data)
    const arrival = new Date("2026-10-04T01:00:00Z")
    await db.occurrenceAttendee.create({ data: { occurrenceId: data.occurrence.id, volunteerId: serving.id, checkedInAt: arrival } })
    const registered = await createRegistrant(data.event.id, { ...input(data.event.id, data.occurrence.id), registerAsParticipant: true }, data.member.id)
    expect(registered.success).toBe(true)
    await checkInToOccurrence(data.occurrence.id, { kind: "volunteer", id: serving.id })
    const attendance = await db.occurrenceAttendee.findMany()
    expect(attendance).toHaveLength(1)
    expect(attendance[0]).toMatchObject({ volunteerId: null, checkedInAt: arrival })
    const other = await db.eventOccurrence.create({ data: { eventId: data.event.id, date: new Date("2026-10-11") } })
    await checkInToOccurrence(other.id, { kind: "volunteer", id: serving.id })
    expect(await db.occurrenceAttendee.findFirst({ where: { occurrenceId: other.id } })).toMatchObject({ volunteerId: serving.id })
  })
  it("exports expected absent participants and marks arrivals separately", async () => {
    const { event, occurrence, member } = await seed()
    const registered = await createRegistrant(event.id, input(event.id, occurrence.id), member.id)
    const absent = await getSessionsAttendanceExport(event.id, occurrence.id)
    expect(absent.success && absent.data.rows).toMatchObject([{ sessionRegistration: true, checkedInAt: null, type: "Member" }])
    if (registered.success) await checkInToOccurrence(occurrence.id, { kind: "registrant", id: registered.data.id })
    const present = await getSessionsAttendanceExport(event.id, occurrence.id)
    expect(present.success && present.data.rows[0].checkedInAt).toBeTruthy()
  })
  it("allows ordinary volunteering participants to pick a table, but excludes its facilitator", async () => {
    const data = await seed()
    const serving = await volunteer(data)
    const group = await db.breakoutGroup.create({ data: { eventId: data.event.id, name: "Table", language: [] } })
    const registered = await createRegistrant(data.event.id, { ...input(data.event.id, data.occurrence.id), registerAsParticipant: true }, data.member.id)
    if (!registered.success) throw new Error(registered.error)
    await checkInToOccurrence(data.occurrence.id, { kind: "registrant", id: registered.data.id })
    expect((await getCheckinBreakoutChoices(registered.data.id, data.event.id, data.occurrence.id)).success).toBe(true)
    await db.breakoutGroup.update({ where: { id: group.id }, data: { facilitatorId: serving.id } })
    expect(await getCheckinBreakoutChoices(registered.data.id, data.event.id, data.occurrence.id)).toMatchObject({ success: true, data: null })
  })
  it("enables latest mode only when a session exists", async () => {
    const { event } = await seed()
    await db.event.update({ where: { id: event.id }, data: { sessionRegistrationEnabled: false, walkInSessionMode: "Pinned" } })
    expect((await setSessionRegistration({ eventId: event.id }, true)).success).toBe(true)
    expect(await db.event.findUnique({ where: { id: event.id } })).toMatchObject({ sessionRegistrationEnabled: true, walkInSessionMode: "Latest" })
    await db.eventOccurrence.deleteMany()
    expect((await setSessionRegistration({ eventId: event.id }, true)).success).toBe(false)
  })
})

describe("Event Day session registration", () => {
  it.each(["Parallel", "Collab"] as const)("uses the pinned session on a %s day and counts a volunteering participant once", async (kind) => {
    const data = await seed()
    await volunteer(data)
    const cluster = await db.eventCluster.create({ data: { name: "Day", kind, date: new Date("2026-10-04"), isOpen: true, checkInIsOpen: true, publicToken: `token-${kind}`, sessionRegistrationEnabled: true, events: { create: { eventId: data.event.id, occurrenceId: data.occurrence.id } } } })
    await db.eventOccurrence.create({ data: { eventId: data.event.id, date: new Date("2026-10-11") } })
    const result = await registerForCluster(cluster.publicToken, { ...input(data.event.id, data.occurrence.id), registerAsParticipant: true }, data.member.id, null, false, [data.event.id])
    expect(result.success && result.data.results[0].status).toBe("registered")
    expect((await db.sessionRegistration.findFirstOrThrow()).occurrenceId).toBe(data.occurrence.id)
    const rows = await getClusterDayRows(await getClusterEvents(cluster.id), { clusterId: cluster.id, date: cluster.date, kind })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("Registrant")
    const lookup = await lookupClusterCheckin(cluster.publicToken, data.member.phone!)
    expect(lookup.success && lookup.data?.matchType === "one" && lookup.data.person.events[0].subject?.kind).toBe("registrant")
    const keys = await breakoutSessionRegistrationKeys({ clusterId: cluster.id })
    expect(keys.has(`member:${data.member.id}`)).toBe(true)
    expect((await registrationSessionTargets(undefined, cluster.id))?.[0].occurrenceId).toBe(data.occurrence.id)
  })
  it("requires explicit linked sessions and retains partial success for closed member events", async () => {
    const data = await seed()
    const closed = await db.event.create({ data: { name: "Closed", type: "OneTime", startDate: new Date(), endDate: new Date(), registrationEnd: new Date("2020-01-01") } })
    const cluster = await db.eventCluster.create({ data: { name: "Day", publicToken: "partial", isOpen: true, events: { create: [{ eventId: data.event.id }, { eventId: closed.id }] } } })
    expect((await setSessionRegistration({ clusterId: cluster.id }, true)).success).toBe(false)
    await db.eventClusterEvent.update({ where: { clusterId_eventId: { clusterId: cluster.id, eventId: data.event.id } }, data: { occurrenceId: data.occurrence.id } })
    expect((await setSessionRegistration({ clusterId: cluster.id }, true)).success).toBe(true)
    const result = await registerForCluster(cluster.publicToken, input(data.event.id, data.occurrence.id), data.member.id, null, false, [data.event.id, closed.id])
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: data.event.id, status: "registered" }),
      expect.objectContaining({ eventId: closed.id, status: "closed" }),
    ]))
    expect(result.data.results).toHaveLength(2)
    expect(await db.sessionRegistration.count()).toBe(1)
  })
})
