/** Invoked through tsx so Playwright's CJS loader need not import the Prisma ESM client. */
import { db } from "../../../lib/db"

async function main() {
  const [command, id] = process.argv.slice(2)
  if (!id?.startsWith("catch-mech-e2e-")) throw new Error("Expected an isolated E2E fixture id")
  const leaderId = `${id}-leader`
  const groupId = `${id}-dgroup`
  const guestIds = [`${id}-alpha`, `${id}-beta`]
  if (command === "clear-attendance") {
    await db.occurrenceAttendee.deleteMany({ where: { occurrence: { eventId: id } } })
    return
  }
  if (command === "cleanup") {
    await db.volunteer.deleteMany({ where: { eventId: id } })
    await db.committeeRole.deleteMany({ where: { committee: { eventId: id } } })
    await db.volunteerCommittee.deleteMany({ where: { eventId: id } })
    await db.event.deleteMany({ where: { id } })
    await db.smallGroup.deleteMany({ where: { id: groupId } })
    await db.guest.deleteMany({ where: { id: { in: guestIds } } })
    await db.member.deleteMany({ where: { id: { in: [leaderId, `${id}-roving`] } } })
    return
  }
  const event = await db.event.create({ data: {
    id, name: "Catch Mech E2E", type: "Recurring", startDate: new Date("2026-01-01"), endDate: new Date("2026-01-15"),
    modules: { create: [{ type: "CatchMech" }, { type: "Breakout" }, { type: "Volunteers" }] },
  } })
  await db.member.create({ data: { id: leaderId, firstName: "Manual", lastName: "Leader", dateJoined: new Date(), language: [] } })
  await db.smallGroup.create({ data: { id: groupId, name: "Manual Capacity Group", leaderId, memberLimit: 0, genderFocus: "Male", locationCity: "Pasig", meetingFormat: "InPerson", scheduleDayOfWeek: 0, scheduleTimeStart: "15:00" } })
  const committee = await db.volunteerCommittee.create({ data: { name: "Hosts", eventId: event.id } })
  const role = await db.committeeRole.create({ data: { name: "Host", committeeId: committee.id } })
  const volunteer = await db.volunteer.create({ data: { eventId: event.id, memberId: leaderId, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" } })
  const breakout = await db.breakoutGroup.create({ data: { eventId: event.id, name: "Table 1", facilitatorId: volunteer.id } })
  const occurrences = []
  for (const date of ["2026-01-01", "2026-01-08", "2026-01-15"]) occurrences.push(await db.eventOccurrence.create({ data: { eventId: event.id, date: new Date(date) } }))
  for (const [index, guestId] of guestIds.entries()) {
    await db.guest.create({ data: { id: guestId, firstName: index ? "Beta" : "Alpha", lastName: "Returnee", gender: "Female", language: [] } })
    const registrant = await db.eventRegistrant.create({ data: { eventId: event.id, guestId, createdAt: new Date("2026-01-01T00:00:00Z") } })
    await db.breakoutGroupMember.create({ data: { breakoutGroupId: breakout.id, registrantId: registrant.id } })
    for (const occurrence of occurrences.slice(0, index ? 3 : 2)) await db.occurrenceAttendee.create({ data: { registrantId: registrant.id, occurrenceId: occurrence.id } })
  }
  const faciSession = await db.catchMechSession.create({ data: { eventId: id, breakoutGroupId: breakout.id, facilitatorVolunteerId: volunteer.id } })
  await db.member.create({ data: { id: `${id}-roving`, firstName: "Roving", lastName: "Volunteer", dateJoined: new Date(), language: [] } })
  const roving = await db.volunteer.create({ data: { eventId: id, memberId: `${id}-roving`, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" } })
  const volunteerSession = await db.catchMechVolunteerSession.create({ data: { eventId: id, volunteerId: roving.id } })
  const request = await db.smallGroupMemberRequest.create({ data: { guestId: guestIds[0], origin: "RegistrationIntent", sourceEventId: event.id } })
  process.stdout.write(JSON.stringify({ eventId: event.id, requestId: request.id, faciToken: faciSession.token, volunteerToken: volunteerSession.token }))
}
main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1 })
