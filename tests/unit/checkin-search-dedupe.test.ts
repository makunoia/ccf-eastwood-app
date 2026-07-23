import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"
import { searchCheckinByName, lookupCheckinRegistrant } from "@/app/(dashboard)/events/actions"

// Check-in name search used to repeat the same person: once per duplicate
// EventRegistrant row, and again when they were also an event volunteer. It also
// only ever matched the per-event registration nickname, never the nickname on
// the Member/Guest profile. These tests pin both fixes.

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventRegistrant", "EventOccurrence", "Volunteer", "CommitteeRole", "VolunteerCommittee", "Event", "Guest", "Member", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: { name: "Search Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
}

async function seedMember(data: {
  firstName: string
  lastName: string
  nickname?: string | null
  phone?: string | null
}) {
  return db.member.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      nickname: data.nickname ?? null,
      phone: data.phone ?? null,
      dateJoined: new Date(),
      language: [],
    },
  })
}

async function seedGuest(data: {
  firstName: string
  lastName: string
  nickname?: string | null
  phone?: string | null
}) {
  return db.guest.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      nickname: data.nickname ?? null,
      phone: data.phone ?? null,
      language: [],
    },
  })
}

async function seedVolunteer(eventId: string, memberId: string) {
  const committee = await db.volunteerCommittee.create({ data: { name: "Logistics", eventId } })
  const role = await db.committeeRole.create({ data: { name: "Usher", committeeId: committee.id } })
  return db.volunteer.create({
    data: { memberId, eventId, committeeId: committee.id, preferredRoleId: role.id },
  })
}

function unwrap<T>(result: { success: true; data: T } | { success: false; error: string }): T {
  if (!result.success) throw new Error(result.error)
  return result.data
}

// ── De-duplication ────────────────────────────────────────────────────────────

describe("searchCheckinByName – de-duplication", () => {
  it("returns one entry when the same guest has two registrant rows", async () => {
    const event = await seedEvent()
    const guest = await seedGuest({ firstName: "Maria", lastName: "Santos" })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const results = unwrap(await searchCheckinByName(event.id, "maria santos", null))

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("Maria Santos")
  })

  it("returns one entry when the same member has two registrant rows", async () => {
    const event = await seedEvent()
    const member = await seedMember({ firstName: "Jose", lastName: "Rizal" })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const results = unwrap(await searchCheckinByName(event.id, "rizal", null))

    expect(results).toHaveLength(1)
  })

  it("prefers the already-checked-in row when duplicates disagree", async () => {
    const event = await seedEvent()
    const guest = await seedGuest({ firstName: "Ana", lastName: "Cruz" })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id, attendedAt: new Date() },
    })

    const results = unwrap(await searchCheckinByName(event.id, "ana cruz", null))

    expect(results).toHaveLength(1)
    expect(results[0].alreadyCheckedIn).toBe(true)
  })

  it("collapses a volunteer who is also a registrant into the volunteer record", async () => {
    const event = await seedEvent()
    const member = await seedMember({ firstName: "Pedro", lastName: "Reyes" })
    await seedVolunteer(event.id, member.id)
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const results = unwrap(await searchCheckinByName(event.id, "pedro reyes", null))

    expect(results).toHaveLength(1)
    expect(results[0].kind).toBe("volunteer")
  })

  it("keeps two different people who share a surname", async () => {
    const event = await seedEvent()
    const a = await seedGuest({ firstName: "Liza", lastName: "Tan" })
    const b = await seedGuest({ firstName: "Mark", lastName: "Tan" })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: a.id } })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: b.id } })

    const results = unwrap(await searchCheckinByName(event.id, "tan", null))

    expect(results).toHaveLength(2)
  })

  it("keeps two unlinked walk-in rows with different contacts apart", async () => {
    const event = await seedEvent()
    await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Sam", lastName: "Lee", mobileNumber: "+63 917 111 1111" },
    })
    await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Sam", lastName: "Lee", mobileNumber: "+63 917 222 2222" },
    })

    const results = unwrap(await searchCheckinByName(event.id, "sam lee", null))

    expect(results).toHaveLength(2)
  })
})

describe("lookupCheckinRegistrant – de-duplication", () => {
  it("does not ask to disambiguate between duplicate rows for one guest", async () => {
    const event = await seedEvent()
    const guest = await seedGuest({ firstName: "Rosa", lastName: "Diaz", phone: "+63 917 333 3333" })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const data = unwrap(await lookupCheckinRegistrant(event.id, "+63 917 333 3333", null))

    expect(data).not.toBeNull()
    expect(data && "matchType" in data).toBe(false)
  })
})

// ── Nickname matching ─────────────────────────────────────────────────────────

describe("searchCheckinByName – nicknames", () => {
  it("finds a registrant by the nickname on their Member profile", async () => {
    const event = await seedEvent()
    const member = await seedMember({ firstName: "Juanito", lastName: "Cruz", nickname: "Jun" })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const results = unwrap(await searchCheckinByName(event.id, "jun", null))

    expect(results).toHaveLength(1)
    expect(results[0].nickname).toBe("Jun")
  })

  it("finds a registrant by the nickname on their Guest profile", async () => {
    const event = await seedEvent()
    const guest = await seedGuest({ firstName: "Bernadette", lastName: "Lim", nickname: "Detdet" })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const results = unwrap(await searchCheckinByName(event.id, "detdet", null))

    expect(results).toHaveLength(1)
    expect(results[0].nickname).toBe("Detdet")
  })

  it("finds a volunteer by their member nickname", async () => {
    const event = await seedEvent()
    const member = await seedMember({ firstName: "Ricardo", lastName: "Gomez", nickname: "Cardo" })
    await seedVolunteer(event.id, member.id)

    const results = unwrap(await searchCheckinByName(event.id, "cardo", null))

    expect(results).toHaveLength(1)
    expect(results[0].kind).toBe("volunteer")
    expect(results[0].nickname).toBe("Cardo")
  })

  it("prefers the per-event registration nickname over the profile nickname", async () => {
    const event = await seedEvent()
    const member = await seedMember({ firstName: "Teodoro", lastName: "Reyes", nickname: "Teddy" })
    await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id, nickname: "Bear" },
    })

    const results = unwrap(await searchCheckinByName(event.id, "reyes", null))

    expect(results[0].nickname).toBe("Bear")
  })

  it("matches a mix of given name and nickname words", async () => {
    const event = await seedEvent()
    const guest = await seedGuest({ firstName: "Junior", lastName: "Santos", nickname: "Kuya Jun" })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const results = unwrap(await searchCheckinByName(event.id, "kuya santos", null))

    expect(results).toHaveLength(1)
  })
})

// ── Walk-in now redirects to the registration page ────────────────────────────

describe("checkin-board – walk-in redirect", () => {
  const board = readFileSync(
    join(process.cwd(), "app/events/[id]/checkin/checkin-board.tsx"),
    "utf8"
  )

  it("no longer embeds the registration form", () => {
    expect(board).not.toContain("RegistrationForm")
  })

  it("links walk-ins to the registration page in check-in mode", () => {
    expect(board).toContain("/register?checkin=")
  })

  it("passes the occurrence id so the walk-in is checked into the right session", () => {
    expect(board).toContain('`/events/${eventId}/register?checkin=${occurrenceId ?? "1"}')
  })
})

describe("register page – walk-in mode", () => {
  const page = readFileSync(join(process.cwd(), "app/events/[id]/register/page.tsx"), "utf8")

  it("reads the checkin search param", () => {
    expect(page).toContain("searchParams")
    expect(page).toContain("checkin")
  })

  it("hands the walk-in config to the shared registration form", () => {
    expect(page).toContain("walkIn={walkIn}")
  })

  it("does not show the closed-form screen to a walk-in at the door", () => {
    // The gate may combine the manual toggle with the Opens/Closes window, but the
    // `&& !walkIn` carve-out must remain so a kiosk walk-in is never blocked.
    expect(page).toContain(") && !walkIn) return <FormClosed />")
  })

  it("only offers breakout groups whose facilitator has checked in", () => {
    expect(page).toContain("fetchBreakoutCandidates(event.id, walkIn.occurrenceId, true)")
  })
})
