import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getHouseholdLabel } from "@/lib/family-links"
import { deleteMember, deleteMembersBatch } from "@/app/(dashboard)/members/actions"
import { promoteGuestToMember } from "@/app/(dashboard)/guests/actions"
import {
  lookupHouseholdForCheckin,
  addHouseholdMemberAtCheckin,
} from "@/app/(dashboard)/events/actions"

/**
 * Two bugs that combined to render a registrant with no name showing an
 * unrelated family's household:
 *
 *  1. `EventRegistrant.memberId` was ON DELETE SET NULL, so deleting a Member
 *     orphaned their registrations instead of removing them. A promoted guest's
 *     registrations have already had guestId moved onto memberId, so the row was
 *     left with both person FKs null and its personal name columns empty.
 *  2. Every household lookup built its filter as
 *     `ref.memberId ? { memberId } : { guestId: ref.guestId as string }`. With
 *     both refs null that is `{ guestId: null }` — `guestId IS NULL` in Postgres
 *     — which matches every member-linked FamilyMember row in the database.
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Family", "FamilyMember", "Member", "Guest", "EventRegistrant", "Event", "EventFormConfig", "EventOccurrence", "OccurrenceAttendee", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "SchedulePreference" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(name = "Pastoral Area Gathering") {
  return db.event.create({
    data: {
      name,
      type: "OneTime",
      startDate: new Date("2026-07-30"),
      endDate: new Date("2026-07-30"),
    },
  })
}

async function seedMember(firstName: string, lastName = "Reyes") {
  return db.member.create({
    data: { firstName, lastName, dateJoined: new Date(), language: [] },
  })
}

async function seedGuest(firstName: string, lastName = "Reyes") {
  return db.guest.create({ data: { firstName, lastName, language: [] } })
}

/** A family whose links are all member-linked, i.e. every row has guestId NULL. */
async function seedMemberFamily(name: string, size: number) {
  const family = await db.family.create({ data: { name } })
  for (let i = 0; i < size; i++) {
    const m = await seedMember(`Person${i}`, name.split(" ")[0])
    await db.familyMember.create({
      data: { familyId: family.id, memberId: m.id, role: i === 0 ? "FatherHusband" : "Child" },
    })
  }
  return family
}

describe("member deletion no longer orphans registrations", () => {
  it("removes the member's registrations instead of nulling the FK", async () => {
    const event = await seedEvent()
    const member = await seedMember("Ana")
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const result = await deleteMember(member.id)
    expect(result.success).toBe(true)

    expect(await db.eventRegistrant.count()).toBe(0)
    const orphans = await db.eventRegistrant.findMany({
      where: { memberId: null, guestId: null, firstName: null },
    })
    expect(orphans).toHaveLength(0)
  })

  it("leaves no nameless row behind for a guest promoted to member (the reported case)", async () => {
    const event = await seedEvent()
    const guest = await seedGuest("Miguel", "Espiritu")
    const leader = await seedMember("Leader", "Cruz")
    const group = await db.smallGroup.create({
      data: { name: "Eastwood DGroup", leaderId: leader.id },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    // Promotion moves the registration from guestId onto memberId — the step
    // that leaves nothing to fall back on once the member is deleted.
    const promoted = await promoteGuestToMember(guest.id, group.id)
    expect(promoted.success).toBe(true)
    if (!promoted.success) return

    const afterPromotion = await db.eventRegistrant.findFirstOrThrow({
      where: { eventId: event.id },
    })
    expect(afterPromotion.guestId).toBeNull()
    expect(afterPromotion.memberId).not.toBeNull()
    expect(afterPromotion.firstName).toBeNull()

    await deleteMember(afterPromotion.memberId as string)

    const remaining = await db.eventRegistrant.findMany()
    expect(remaining).toHaveLength(0)
  })

  it("holds for the batch delete path too", async () => {
    const event = await seedEvent()
    const a = await seedMember("Ana")
    const b = await seedMember("Ben")
    await db.eventRegistrant.createMany({
      data: [
        { eventId: event.id, memberId: a.id },
        { eventId: event.id, memberId: b.id },
      ],
    })

    const result = await deleteMembersBatch([a.id, b.id])
    expect(result.success).toBe(true)

    const orphans = await db.eventRegistrant.findMany({
      where: { memberId: null, guestId: null },
    })
    expect(orphans).toHaveLength(0)
  })

  it("keeps a genuinely anonymous registrant, which has no member to cascade from", async () => {
    const event = await seedEvent()
    const member = await seedMember("Ana")
    await db.eventRegistrant.create({
      data: { eventId: event.id, firstName: "Walk", lastName: "In" },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    await deleteMember(member.id)

    const remaining = await db.eventRegistrant.findMany()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].firstName).toBe("Walk")
  })
})

describe("getHouseholdLabel", () => {
  it("returns null for a registrant with no person FK, even when families exist", async () => {
    // Every link in this family is member-linked, so every row has guestId NULL —
    // exactly what `{ guestId: null }` used to match.
    await seedMemberFamily("Espiritu Family", 3)

    const label = await getHouseholdLabel({ memberId: null, guestId: null })
    expect(label).toBeNull()
  })

  it("does not fall back to the oldest family when the ref is empty", async () => {
    // The old filter took `orderBy: createdAt asc`, so it always surfaced this one.
    await seedMemberFamily("Espiritu Family", 3)
    await seedMemberFamily("Santos Family", 2)

    const label = await getHouseholdLabel({ memberId: null, guestId: null })
    expect(label).toBeNull()
  })

  it("still labels a real member's household", async () => {
    const family = await db.family.create({ data: { name: "Dela Cruz Family" } })
    const juan = await seedMember("Juan", "Dela Cruz")
    const maria = await seedMember("Maria", "Dela Cruz")
    await db.familyMember.create({
      data: { familyId: family.id, memberId: juan.id, role: "FatherHusband" },
    })
    await db.familyMember.create({
      data: { familyId: family.id, memberId: maria.id, role: "MotherWife" },
    })

    expect(await getHouseholdLabel({ memberId: juan.id, guestId: null })).toBe(
      "Dela Cruz Family (+1 member)"
    )
  })

  it("still labels a real guest's household, and pluralises", async () => {
    const family = await db.family.create({ data: { name: "Santos Family" } })
    const guest = await seedGuest("Pia", "Santos")
    await db.familyMember.create({
      data: { familyId: family.id, guestId: guest.id, role: "Child" },
    })
    for (const name of ["Rico", "Bea"]) {
      const m = await seedMember(name, "Santos")
      await db.familyMember.create({
        data: { familyId: family.id, memberId: m.id, role: "FatherHusband" },
      })
    }

    expect(await getHouseholdLabel({ memberId: null, guestId: guest.id })).toBe(
      "Santos Family (+2 members)"
    )
  })

  it("returns the bare family name when the person is its only link", async () => {
    const family = await db.family.create({ data: { name: "Solo Family" } })
    const member = await seedMember("Solo")
    await db.familyMember.create({
      data: { familyId: family.id, memberId: member.id, role: "Other" },
    })

    expect(await getHouseholdLabel({ memberId: member.id, guestId: null })).toBe("Solo Family")
  })

  it("returns null for someone who belongs to no family", async () => {
    await seedMemberFamily("Espiritu Family", 3)
    const stranger = await seedMember("Nobody")

    expect(await getHouseholdLabel({ memberId: stranger.id, guestId: null })).toBeNull()
  })
})

/** Family check-in is opt-in, so these lookups need the section turned on. */
async function enableFamilyCheckin(eventId: string) {
  await db.eventFormConfig.create({
    data: { eventId, context: "CheckIn", sectionFamily: true },
  })
}

describe("check-in household lookups reject an unlinked registrant", () => {
  it("lookupHouseholdForCheckin returns null rather than a stranger's household", async () => {
    const event = await seedEvent()
    await enableFamilyCheckin(event.id)
    await seedMemberFamily("Espiritu Family", 3)
    const orphan = await db.eventRegistrant.create({
      data: { eventId: event.id },
      select: { id: true },
    })

    const result = await lookupHouseholdForCheckin(event.id, orphan.id, null)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toBeNull()
  })

  it("addHouseholdMemberAtCheckin refuses to attach anyone to a stranger's family", async () => {
    const event = await seedEvent()
    await enableFamilyCheckin(event.id)
    const family = await seedMemberFamily("Espiritu Family", 3)
    const orphan = await db.eventRegistrant.create({
      data: { eventId: event.id },
      select: { id: true },
    })

    const result = await addHouseholdMemberAtCheckin(
      event.id,
      orphan.id,
      { firstName: "Intruder", lastName: "Reyes", role: "Child" },
      null
    )

    expect(result.success).toBe(false)
    // The stranger's family gained nobody.
    expect(await db.familyMember.count({ where: { familyId: family.id } })).toBe(3)
    expect(await db.guest.count({ where: { firstName: "Intruder" } })).toBe(0)
  })

  it("still resolves the household for a properly linked registrant", async () => {
    const event = await seedEvent()
    await enableFamilyCheckin(event.id)
    const family = await db.family.create({ data: { name: "Dela Cruz Family" } })
    const juan = await seedMember("Juan", "Dela Cruz")
    await db.familyMember.create({
      data: { familyId: family.id, memberId: juan.id, role: "FatherHusband" },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: juan.id },
      select: { id: true },
    })

    const result = await lookupHouseholdForCheckin(event.id, registrant.id, null)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data?.familyName).toBe("Dela Cruz Family")
  })
})
