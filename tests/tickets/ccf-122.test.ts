import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { FORM_FIELD_KEYS, FORM_SECTION_KEYS } from "@/lib/forms/context-config"
import {
  createHouseholdRegistration,
  lookupHouseholdForCheckin,
  checkInHousehold,
  addHouseholdMemberAtCheckin,
} from "@/app/(dashboard)/events/actions"
import { findFamilyBySpouse, repointFamilyLinks } from "@/lib/family-links"
import { deriveFamilyName, householdSchema } from "@/lib/validations/household"

/**
 * CCF-122 — household registration + household check-in.
 *
 *  - unit:        family-name derivation, household schema bounds
 *  - integration: one Family per household, N registrants, family-scoped member
 *                 matching, spouse-pair dedupe across events
 *  - regression:  a second registration by either spouse reuses the family
 *                 rather than duplicating it; guest→member promotion keeps the
 *                 family link; household members are never auto-assigned to a
 *                 breakout; lookup and group check-in never write family
 *                 structure (only the explicit add-member action does)
 *  - edge case:   household of one, repeated registration, cross-event reuse,
 *                 same-name child distinguished by birth year, lazy Family
 *                 creation for someone with no family
 */

async function makeEvent(name = "Family Camp") {
  return db.event.create({
    data: {
      name,
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
    select: { id: true },
  })
}

const PRIMARY = {
  firstName: "Mark",
  lastName: "dela Cruz",
  mobileNumber: "+63 917 111 2222",
}

const KIDS = [
  { firstName: "Juan", lastName: "dela Cruz", role: "Child" as const, birthYear: 2015 },
  { firstName: "Ana", lastName: "dela Cruz", role: "Child" as const, birthYear: 2018 },
]

/**
 * Every section and field enabled. `createRegistrant` enforces the form config
 * server-side, so a test that submits optional fields has to be registering
 * against an event whose form actually collects them. Options like
 * `familySpouseOnly` stay off — they restrict a section rather than enable one.
 */
const ALL_FORM_TOGGLES = Object.fromEntries(
  [...FORM_SECTION_KEYS, ...FORM_FIELD_KEYS].map((k) => [k, true])
)

const FULLY_COLLECTING_FORM = {
  create: (["Register", "WalkIn", "CheckIn"] as const).map((context) => ({
    context,
    ...ALL_FORM_TOGGLES,
  })),
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "EventRegistrant", "EventFormConfig", "Event", "FamilyMember", "Family",
    "Guest", "Member", "OccurrenceAttendee", "EventOccurrence",
    "BreakoutGroupMember", "BreakoutGroup", "Volunteer", "CommitteeRole", "VolunteerCommittee"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-122 unit — naming and schema", () => {
  it("derives a family name from the primary's last name", () => {
    expect(deriveFamilyName("dela Cruz")).toBe("dela Cruz Family")
    expect(deriveFamilyName("  Tan  ")).toBe("Tan Family")
    expect(deriveFamilyName("")).toBe("Family")
  })

  it("accepts a household of one (no extra members)", () => {
    const parsed = householdSchema.safeParse({ primaryRole: "FatherHusband", members: [] })
    expect(parsed.success).toBe(true)
  })

  it("rejects an oversized household", () => {
    const parsed = householdSchema.safeParse({
      primaryRole: "FatherHusband",
      members: Array.from({ length: 13 }, (_, i) => ({
        firstName: `Kid${i}`,
        lastName: "Cruz",
        role: "Child",
      })),
    })
    expect(parsed.success).toBe(false)
  })
})

describe("CCF-122 integration — household registration", () => {
  it("creates one Family, one registrant per person, and links everyone", async () => {
    const event = await makeEvent()

    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: KIDS },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(await db.family.count()).toBe(1)
    const family = await db.family.findUniqueOrThrow({ where: { id: result.data.familyId } })
    expect(family.name).toBe("dela Cruz Family")

    // Primary + 2 children.
    expect(await db.familyMember.count({ where: { familyId: family.id } })).toBe(3)
    expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(3)
    expect(result.data.householdRegistrantIds).toHaveLength(2)

    const roles = await db.familyMember.findMany({
      where: { familyId: family.id },
      select: { role: true },
    })
    expect(roles.filter((r) => r.role === "FatherHusband")).toHaveLength(1)
    expect(roles.filter((r) => r.role === "Child")).toHaveLength(2)
  })

  it("keeps contact details on the primary only", async () => {
    const event = await makeEvent()
    await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: KIDS },
      null
    )

    const kids = await db.guest.findMany({
      where: { firstName: { in: ["Juan", "Ana"] } },
      select: { phone: true, email: true },
    })
    expect(kids).toHaveLength(2)
    for (const kid of kids) {
      expect(kid.phone).toBeNull()
      expect(kid.email).toBeNull()
    }

    const primary = await db.guest.findFirstOrThrow({ where: { firstName: "Mark" } })
    expect(primary.phone).toBe(PRIMARY.mobileNumber)
  })

  it("registers a household of one and still creates the Family", async () => {
    const event = await makeEvent()
    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: [] },
      null
    )
    expect(result.success).toBe(true)
    expect(await db.family.count()).toBe(1)
    expect(await db.familyMember.count()).toBe(1)
  })

  it("honors an explicit family name", async () => {
    const event = await makeEvent()
    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: [], familyName: "The Cruz Household" },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    const family = await db.family.findUniqueOrThrow({ where: { id: result.data.familyId } })
    expect(family.name).toBe("The Cruz Household")
  })
})

describe("CCF-122 regression — spouse-pair dedupe", () => {
  it("reuses the family when the same spouse registers for another event", async () => {
    const eventA = await makeEvent("Camp A")
    const eventB = await makeEvent("Camp B")

    const first = await createHouseholdRegistration(
      eventA.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: KIDS },
      null
    )
    expect(first.success).toBe(true)

    const second = await createHouseholdRegistration(
      eventB.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: KIDS },
      null
    )
    expect(second.success).toBe(true)

    // One family, one Guest per person — not duplicated per event.
    expect(await db.family.count()).toBe(1)
    expect(await db.familyMember.count()).toBe(3)
    expect(await db.guest.count()).toBe(3)
    // But a registrant per person per event.
    expect(await db.eventRegistrant.count({ where: { eventId: eventA.id } })).toBe(3)
    expect(await db.eventRegistrant.count({ where: { eventId: eventB.id } })).toBe(3)
  })

  it("reuses the family when the OTHER spouse registers the household", async () => {
    // "Either spouse is enough": whoever fills the form is the primary and is
    // deduped by their own contact details, so the wife registering later
    // resolves the same family the husband created.
    const eventA = await makeEvent("Camp A")
    const eventB = await makeEvent("Camp B")

    const husbandFirst = await createHouseholdRegistration(
      eventA.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: KIDS },
      null
    )
    expect(husbandFirst.success).toBe(true)
    if (!husbandFirst.success) return

    // Wife is added to the same family by an admin (she has her own contact details).
    const wife = await db.guest.create({
      data: { firstName: "Maria", lastName: "dela Cruz", phone: "+63 917 333 4444", language: [] },
      select: { id: true },
    })
    await db.familyMember.create({
      data: { familyId: husbandFirst.data.familyId, guestId: wife.id, role: "MotherWife" },
    })

    const wifeRegisters = await createHouseholdRegistration(
      eventB.id,
      { firstName: "Maria", lastName: "dela Cruz", mobileNumber: "+63 917 333 4444" },
      { primaryRole: "MotherWife", members: KIDS },
      null
    )
    expect(wifeRegisters.success).toBe(true)
    if (!wifeRegisters.success) return

    expect(wifeRegisters.data.familyId).toBe(husbandFirst.data.familyId)
    expect(await db.family.count()).toBe(1)
  })

  it("matches household members within the family rather than globally", async () => {
    // A same-named child in an unrelated family must not be absorbed.
    const other = await db.family.create({ data: { name: "Other Family" }, select: { id: true } })
    const strangerChild = await db.guest.create({
      data: { firstName: "Juan", lastName: "dela Cruz", language: [] },
      select: { id: true },
    })
    await db.familyMember.create({
      data: { familyId: other.id, guestId: strangerChild.id, role: "Child" },
    })

    const event = await makeEvent()
    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: [KIDS[0]] },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    // The stranger stays in their own family; a new Juan was created here.
    const strangerLinks = await db.familyMember.findMany({ where: { guestId: strangerChild.id } })
    expect(strangerLinks).toHaveLength(1)
    expect(strangerLinks[0].familyId).toBe(other.id)
    expect(await db.familyMember.count({ where: { familyId: result.data.familyId } })).toBe(2)
  })

  it("distinguishes a same-named child by birth year", async () => {
    const event = await makeEvent()
    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      {
        primaryRole: "FatherHusband",
        members: [
          { firstName: "Juan", lastName: "dela Cruz", role: "Child", birthYear: 2015 },
          { firstName: "Juan", lastName: "dela Cruz", role: "Child", birthYear: 2020 },
        ],
      },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    // Two distinct children, not one matched onto the other.
    expect(await db.familyMember.count({ where: { familyId: result.data.familyId } })).toBe(3)
    expect(result.data.householdRegistrantIds).toHaveLength(2)
  })

  it("keeps the family link when a household guest is promoted to member", async () => {
    const event = await makeEvent()
    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: [KIDS[0]] },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    const child = await db.guest.findFirstOrThrow({ where: { firstName: "Juan" } })
    const promoted = await db.member.create({
      data: { firstName: "Juan", lastName: "dela Cruz", dateJoined: new Date(), language: [] },
      select: { id: true },
    })

    await db.$transaction(async (tx) => {
      await repointFamilyLinks(tx, { guestId: child.id }, { memberId: promoted.id })
    })

    const links = await db.familyMember.findMany({
      where: { familyId: result.data.familyId },
      select: { memberId: true, guestId: true },
    })
    expect(links).toHaveLength(2)
    expect(links.some((l) => l.memberId === promoted.id)).toBe(true)
    expect(links.some((l) => l.guestId === child.id)).toBe(false)
  })

  it("findFamilyBySpouse ignores non-spouse roles", async () => {
    const family = await db.family.create({ data: { name: "Cruz Family" }, select: { id: true } })
    const child = await db.guest.create({
      data: { firstName: "Kid", lastName: "Cruz", language: [] },
      select: { id: true },
    })
    await db.familyMember.create({
      data: { familyId: family.id, guestId: child.id, role: "Child" },
    })

    // A Child in their parents' family heads no family of their own.
    expect(await findFamilyBySpouse({ guestId: child.id })).toBeNull()
  })
})

describe("CCF-122 audit — identity, duplicates, and the volunteer guard", () => {
  // All three found by probing rather than reasoning, after the first pass shipped.

  it("distinguishes same-named household members by role (ticket edge case 4)", async () => {
    const event = await makeEvent()
    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      {
        primaryRole: "FatherHusband",
        members: [
          { firstName: "Ana", lastName: "dela Cruz", role: "Child" },
          { firstName: "Ana", lastName: "dela Cruz", role: "Guardian" },
        ],
      },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    const roles = await db.familyMember.findMany({
      where: { familyId: result.data.familyId },
      select: { role: true },
    })
    // Primary + two distinct Anas, not one.
    expect(roles).toHaveLength(3)
    expect(roles.filter((r) => r.role === "Child")).toHaveLength(1)
    expect(roles.filter((r) => r.role === "Guardian")).toHaveLength(1)
    expect(result.data.householdRegistrantIds).toHaveLength(2)
  })

  it("returns no duplicate registrant ids when two entries resolve to one person", async () => {
    const event = await makeEvent()
    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      {
        primaryRole: "FatherHusband",
        members: [
          { firstName: "Juan", lastName: "dela Cruz", role: "Child" },
          { firstName: "Juan", lastName: "dela Cruz", role: "Child" },
        ],
      },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    // Same name + same role + no birth year = one person, so one id — not the
    // same id twice, which would overstate how many people registered.
    const ids = result.data.householdRegistrantIds
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(1)
  })

  it("does not register a household member who is serving as a volunteer", async () => {
    // NOTE the reach of this guard: it fires only when the household entry
    // resolves to an existing *Member* inside the family. A volunteer typed in
    // as a fresh name creates a Guest and can't be recognised — household
    // members carry no contact details, so there's nothing to match on. Same
    // root cause as the ticket's edge case 2 not applying.
    const event = await makeEvent()
    const member = await db.member.create({
      data: { firstName: "Vol", lastName: "dela Cruz", dateJoined: new Date(), language: [] },
      select: { id: true },
    })
    const committee = await db.volunteerCommittee.create({
      data: { name: "Facilitators", eventId: event.id },
      select: { id: true },
    })
    const role = await db.committeeRole.create({
      data: { name: "Facilitator", committeeId: committee.id },
      select: { id: true },
    })
    await db.volunteer.create({
      data: {
        memberId: member.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
        status: "Confirmed",
      },
    })

    // Existing household: the primary (matched by phone on registration) plus
    // the volunteer already linked as a family member.
    const primaryGuest = await db.guest.create({
      data: {
        firstName: "Mark",
        lastName: "dela Cruz",
        phone: PRIMARY.mobileNumber,
        language: [],
      },
      select: { id: true },
    })
    const family = await db.family.create({
      data: { name: "dela Cruz Family" },
      select: { id: true },
    })
    await db.familyMember.create({
      data: { familyId: family.id, guestId: primaryGuest.id, role: "FatherHusband" },
    })
    await db.familyMember.create({
      data: { familyId: family.id, memberId: member.id, role: "Child" },
    })

    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      {
        primaryRole: "FatherHusband",
        members: [{ firstName: "Vol", lastName: "dela Cruz", role: "Child" }],
      },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.familyId).toBe(family.id)
    expect(result.data.skippedVolunteers).toContain("Vol dela Cruz")
    expect(
      await db.eventRegistrant.count({ where: { eventId: event.id, memberId: member.id } })
    ).toBe(0)
    // The family link is kept — only the attendee registration is skipped.
    expect(
      await db.familyMember.count({ where: { familyId: family.id, memberId: member.id } })
    ).toBe(1)
  })
})

describe("CCF-122 — breakout assignment is not inferred per household member", () => {
  it("leaves household members unassigned even when the event auto-assigns", async () => {
    const event = await db.event.create({
      data: {
        name: "Family Day",
        type: "OneTime",
        startDate: new Date(),
        endDate: new Date(),
        autoAssignBreakout: true,
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
      select: { id: true },
    })
    const leaderMember = await db.member.create({
      data: { firstName: "Faci", lastName: "Litator", dateJoined: new Date(), language: [] },
      select: { id: true },
    })
    const committee = await db.volunteerCommittee.create({
      data: { name: "Facilitators", eventId: event.id },
      select: { id: true },
    })
    const role = await db.committeeRole.create({
      data: { name: "Facilitator", committeeId: committee.id },
      select: { id: true },
    })
    const volunteer = await db.volunteer.create({
      data: {
        memberId: leaderMember.id,
        eventId: event.id,
        committeeId: committee.id,
        preferredRoleId: role.id,
        status: "Confirmed",
      },
      select: { id: true },
    })
    await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id },
    })

    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: KIDS },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    // Siblings must not be scattered across groups by age-based auto-assign.
    const kidAssignments = await db.breakoutGroupMember.count({
      where: { registrantId: { in: result.data.householdRegistrantIds } },
    })
    expect(kidAssignments).toBe(0)
  })
})

describe("CCF-122 — check-in add member + lazy Family creation", () => {
  it("lazily creates a Family for someone who has none", async () => {
    const event = await makeEvent()
    const guest = await db.guest.create({
      data: { firstName: "Solo", lastName: "Reyes", phone: "+63 917 555 6666", language: [] },
      select: { id: true },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
      select: { id: true },
    })
    expect(await db.family.count()).toBe(0)

    const result = await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      { firstName: "Kid", lastName: "Reyes", role: "Child" },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(await db.family.count()).toBe(1)
    const family = await db.family.findUniqueOrThrow({ where: { id: result.data.familyId } })
    expect(family.name).toBe("Reyes Family")
    // Subject back-linked, plus the new person.
    expect(await db.familyMember.count({ where: { familyId: family.id } })).toBe(2)
  })

  it("checks the added person in immediately", async () => {
    const event = await makeEvent()
    const guest = await db.guest.create({
      data: { firstName: "Solo", lastName: "Reyes", language: [] },
      select: { id: true },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
      select: { id: true },
    })

    const result = await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      { firstName: "Kid", lastName: "Reyes", role: "Child" },
      null
    )
    expect(result.success).toBe(true)
    if (!result.success) return

    const added = await db.eventRegistrant.findUniqueOrThrow({
      where: { id: result.data.registrantId },
      select: { attendedAt: true },
    })
    expect(added.attendedAt).not.toBeNull()
  })

  it("reuses the existing family rather than creating a second one", async () => {
    const { event, result } = await seedHouseholdFor()
    const before = await db.family.count()

    const added = await addHouseholdMemberAtCheckin(
      event.id,
      result.data.id,
      { firstName: "Late", lastName: "dela Cruz", role: "Child" },
      null
    )
    expect(added.success).toBe(true)
    if (!added.success) return

    expect(await db.family.count()).toBe(before)
    expect(added.data.familyId).toBe(result.data.familyId)
  })

  it("dedupes at the registrant level for someone already registered", async () => {
    const { event, result } = await seedHouseholdFor()
    const registrantsBefore = await db.eventRegistrant.count({ where: { eventId: event.id } })

    // "Juan" is already a registered household member.
    const added = await addHouseholdMemberAtCheckin(
      event.id,
      result.data.id,
      { firstName: "Juan", lastName: "dela Cruz", role: "Child", birthYear: 2015 },
      null
    )
    expect(added.success).toBe(true)

    // No second registrant for the same person — attendance must count once.
    expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(
      registrantsBefore
    )
  })

  it("does not assign the added person to a breakout", async () => {
    const { event, result } = await seedHouseholdFor()
    const added = await addHouseholdMemberAtCheckin(
      event.id,
      result.data.id,
      { firstName: "Late", lastName: "dela Cruz", role: "Child" },
      null
    )
    expect(added.success).toBe(true)
    if (!added.success) return

    expect(
      await db.breakoutGroupMember.count({ where: { registrantId: added.data.registrantId } })
    ).toBe(0)
  })

  it("refuses a subject from another event", async () => {
    const { result } = await seedHouseholdFor()
    const otherEvent = await makeEvent("Unrelated")
    const added = await addHouseholdMemberAtCheckin(
      otherEvent.id,
      result.data.id,
      { firstName: "Late", lastName: "dela Cruz", role: "Child" },
      null
    )
    expect(added.success).toBe(false)
  })

  it("rejects a blank name", async () => {
    const { event, result } = await seedHouseholdFor()
    const added = await addHouseholdMemberAtCheckin(
      event.id,
      result.data.id,
      { firstName: "", lastName: "dela Cruz", role: "Child" },
      null
    )
    expect(added.success).toBe(false)
  })
})

async function seedHouseholdFor() {
  const event = await db.event.create({
    data: { name: "Family Camp", type: "OneTime", startDate: new Date(), endDate: new Date(),
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
    select: { id: true },
  })
  const result = await createHouseholdRegistration(
    event.id,
    PRIMARY,
    { primaryRole: "FatherHusband", members: KIDS },
    null
  )
  if (!result.success) throw new Error("seed failed")
  return { event, result }
}

describe("CCF-122 — household check-in", () => {
  async function seedHousehold() {
    const event = await makeEvent()
    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: KIDS },
      null
    )
    if (!result.success) throw new Error("seed failed")
    return { event, result }
  }

  it("surfaces the whole household from any one member", async () => {
    const { event, result } = await seedHousehold()

    const lookup = await lookupHouseholdForCheckin(event.id, result.data.id, null)
    expect(lookup.success).toBe(true)
    if (!lookup.success || !lookup.data) throw new Error("expected a household")

    expect(lookup.data.members).toHaveLength(3)
    expect(lookup.data.familyName).toBe("dela Cruz Family")
    // The looked-up person sorts first and is flagged.
    expect(lookup.data.members[0].isSubject).toBe(true)
  })

  it("returns null for someone with no household", async () => {
    const event = await makeEvent()
    const guest = await db.guest.create({
      data: { firstName: "Solo", lastName: "Person", language: [] },
      select: { id: true },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
      select: { id: true },
    })

    const lookup = await lookupHouseholdForCheckin(event.id, registrant.id, null)
    expect(lookup.success).toBe(true)
    if (lookup.success) expect(lookup.data).toBeNull()
  })

  it("returns a solo household when nobody else is registered, so a member can be added", async () => {
    await seedHousehold()
    const otherEvent = await makeEvent("Unrelated")

    // Only the primary registers for the other event.
    const primaryGuest = await db.guest.findFirstOrThrow({ where: { firstName: "Mark" } })
    const lone = await db.eventRegistrant.create({
      data: { eventId: otherEvent.id, guestId: primaryGuest.id },
      select: { id: true },
    })

    const lookup = await lookupHouseholdForCheckin(otherEvent.id, lone.id, null)
    expect(lookup.success).toBe(true)
    if (!lookup.success || !lookup.data) throw new Error("expected a solo household")
    expect(lookup.data.members).toHaveLength(1)
    expect(lookup.data.members[0].isSubject).toBe(true)
  })

  it("checks in several household members at once", async () => {
    const { event, result } = await seedHousehold()
    const ids = [result.data.id, ...result.data.householdRegistrantIds]

    const checkin = await checkInHousehold(event.id, ids, null)
    expect(checkin.success).toBe(true)
    if (checkin.success) expect(checkin.data.checkedIn).toBe(3)

    const attended = await db.eventRegistrant.count({
      where: { eventId: event.id, attendedAt: { not: null } },
    })
    expect(attended).toBe(3)
  })

  it("reflects who is already checked in", async () => {
    const { event, result } = await seedHousehold()
    await checkInHousehold(event.id, [result.data.id], null)

    const lookup = await lookupHouseholdForCheckin(event.id, result.data.id, null)
    if (!lookup.success || !lookup.data) throw new Error("expected a household")

    const subject = lookup.data.members.find((m) => m.isSubject)
    expect(subject?.alreadyCheckedIn).toBe(true)
    expect(lookup.data.members.filter((m) => m.alreadyCheckedIn)).toHaveLength(1)
  })

  it("refuses registrants from another event", async () => {
    const { result } = await seedHousehold()
    const otherEvent = await makeEvent("Unrelated")

    const checkin = await checkInHousehold(otherEvent.id, [result.data.id], null)
    expect(checkin.success).toBe(false)
  })

  it("refuses an empty selection", async () => {
    const { event } = await seedHousehold()
    expect((await checkInHousehold(event.id, [], null)).success).toBe(false)
  })

  it("lookup and group check-in never create or edit family structure", async () => {
    // Only addHouseholdMemberAtCheckin may write family structure at the door.
    const { event, result } = await seedHousehold()
    const familiesBefore = await db.family.count()
    const linksBefore = await db.familyMember.count()

    await lookupHouseholdForCheckin(event.id, result.data.id, null)
    await checkInHousehold(event.id, [result.data.id, ...result.data.householdRegistrantIds], null)

    expect(await db.family.count()).toBe(familiesBefore)
    expect(await db.familyMember.count()).toBe(linksBefore)
  })

  it("records per-occurrence attendance when given an occurrence", async () => {
    const event = await db.event.create({
      data: {
        name: "MultiDay Camp",
        type: "MultiDay",
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2026-08-02T00:00:00Z"),
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
      select: { id: true },
    })
    const occurrence = await db.eventOccurrence.create({
      data: { eventId: event.id, date: new Date("2026-08-01T00:00:00Z") },
      select: { id: true },
    })

    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      { primaryRole: "FatherHusband", members: KIDS },
      null
    )
    if (!result.success) throw new Error("seed failed")

    const ids = [result.data.id, ...result.data.householdRegistrantIds]
    const checkin = await checkInHousehold(event.id, ids, occurrence.id)
    expect(checkin.success).toBe(true)

    expect(
      await db.occurrenceAttendee.count({
        where: { occurrenceId: occurrence.id, registrantId: { not: null } },
      })
    ).toBe(3)

    // Attendance is per-occurrence, so the OneTime column stays untouched.
    expect(
      await db.eventRegistrant.count({ where: { eventId: event.id, attendedAt: { not: null } } })
    ).toBe(0)
  })

  it("is idempotent — re-checking in the same household does not duplicate attendance", async () => {
    const { event, result } = await seedHousehold()
    const ids = [result.data.id, ...result.data.householdRegistrantIds]

    await checkInHousehold(event.id, ids, null)
    await checkInHousehold(event.id, ids, null)

    expect(
      await db.eventRegistrant.count({ where: { eventId: event.id, attendedAt: { not: null } } })
    ).toBe(3)
  })
})
