/**
 * Nickname persistence for HOUSEHOLD members.
 *
 * The primary registrant's paths (`resolveAnonymousGuest`,
 * `resolveConfirmedGuest`, `resolveConfirmedMember`) all write the nickname
 * onto the profile fill-if-empty; `tests/integration/form-field-nickname`
 * pins those. The household paths only did it on the CREATE branch, so a
 * household member first added without a nickname could never gain one — every
 * later registration matched the existing guest and dropped the answer.
 *
 *  - regression: a matched household member's empty nickname is filled, on both
 *                the registration form and the check-in desk
 *  - edge case:  a nickname already on file is never overwritten; the field
 *                toggle still gates a crafted payload
 *  - unit:       the sanitizer's household gate is pinned in
 *                tests/unit/form-field-nickname
 *  - e2e:        skipped — no new UI, this is a server-side write rule
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import {
  addHouseholdMemberAtCheckin,
  createHouseholdRegistration,
} from "@/app/(dashboard)/events/actions"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE
    "FamilyMember", "Family", "EventRegistrant", "EventFormConfig",
    "Event", "Guest", "Member"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

const PRIMARY = {
  firstName: "Juan",
  lastName: "Dela Cruz",
  nickname: "Jun",
  mobileNumber: "+63 917 111 2222",
}

async function seedEvent(
  context: "Register" | "CheckIn" = "Register",
  nicknameOn = true
) {
  const event = await db.event.create({
    data: {
      name: "Family Day",
      type: "OneTime",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
    },
  })
  await db.eventFormConfig.create({
    data: {
      eventId: event.id,
      context,
      fieldNickname: nicknameOn,
      sectionFamily: true,
    },
  })
  return event
}

function household(member: { nickname?: string | null }) {
  return {
    familyName: "Dela Cruz Family",
    primaryRole: "FatherHusband" as const,
    members: [
      {
        firstName: "Ana",
        lastName: "Dela Cruz",
        role: "Child" as const,
        ...(member.nickname !== undefined ? { nickname: member.nickname } : {}),
      },
    ],
  }
}

async function ana() {
  return db.guest.findFirstOrThrow({ where: { firstName: "Ana" } })
}

describe("createHouseholdRegistration — household member nickname", () => {
  it("stores a new household member's nickname on their Guest record", async () => {
    const event = await seedEvent()

    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      household({ nickname: "Anne" }),
      null
    )

    expect(result.success).toBe(true)
    expect((await ana()).nickname).toBe("Anne")
  })

  it("regression — fills the nickname of a household member who already exists", async () => {
    // First event: added with no nickname. Second event: the family gives one.
    // Before the fix the second registration matched the existing guest and the
    // answer was discarded, so the nickname could never be captured at all.
    const first = await seedEvent()
    const second = await seedEvent()

    await createHouseholdRegistration(first.id, PRIMARY, household({}), null)
    expect((await ana()).nickname).toBeNull()

    const result = await createHouseholdRegistration(
      second.id,
      PRIMARY,
      household({ nickname: "Anne" }),
      null
    )

    expect(result.success).toBe(true)
    expect((await ana()).nickname).toBe("Anne")
    // Matched, not duplicated — Juan and Ana, no second Ana.
    expect(await db.guest.count()).toBe(2)
  })

  it("edge case — never overwrites a nickname the household member already has", async () => {
    const first = await seedEvent()
    const second = await seedEvent()

    await createHouseholdRegistration(
      first.id,
      PRIMARY,
      household({ nickname: "Anne" }),
      null
    )
    await createHouseholdRegistration(
      second.id,
      PRIMARY,
      household({ nickname: "Annie" }),
      null
    )

    expect((await ana()).nickname).toBe("Anne")
  })

  it("edge case — drops a crafted nickname when the field is off", async () => {
    const first = await seedEvent("Register", true)
    const second = await seedEvent("Register", false)

    await createHouseholdRegistration(first.id, PRIMARY, household({}), null)
    await createHouseholdRegistration(
      second.id,
      PRIMARY,
      household({ nickname: "Anne" }),
      null
    )

    expect((await ana()).nickname).toBeNull()
  })
})

describe("addHouseholdMemberAtCheckin — household member nickname", () => {
  /** A checked-in primary plus their family, so the desk can add to it. */
  async function seedCheckedInFamily(nicknameOn = true) {
    const event = await seedEvent("CheckIn", nicknameOn)
    const primary = await db.guest.create({
      data: { firstName: "Juan", lastName: "Dela Cruz", language: [] },
    })
    const child = await db.guest.create({
      data: { firstName: "Ana", lastName: "Dela Cruz", language: [] },
    })
    const family = await db.family.create({ data: { name: "Dela Cruz Family" } })
    await db.familyMember.create({
      data: { familyId: family.id, guestId: primary.id, role: "FatherHusband" },
    })
    await db.familyMember.create({
      data: { familyId: family.id, guestId: child.id, role: "Child" },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: primary.id },
    })
    return { event, registrant, child }
  }

  it("regression — fills the empty nickname of someone already on the family roster", async () => {
    const { event, registrant } = await seedCheckedInFamily()

    const result = await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      { firstName: "Ana", lastName: "Dela Cruz", nickname: "Anne", role: "Child" },
      null
    )

    expect(result.success).toBe(true)
    expect((await ana()).nickname).toBe("Anne")
    expect(await db.guest.count()).toBe(2)
  })

  it("edge case — never overwrites a nickname already on file", async () => {
    const { event, registrant, child } = await seedCheckedInFamily()
    await db.guest.update({ where: { id: child.id }, data: { nickname: "Anne" } })

    await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      { firstName: "Ana", lastName: "Dela Cruz", nickname: "Annie", role: "Child" },
      null
    )

    expect((await ana()).nickname).toBe("Anne")
  })

  it("edge case — drops a crafted nickname when the check-in form doesn't ask", async () => {
    const { event, registrant } = await seedCheckedInFamily(false)

    await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      { firstName: "Ana", lastName: "Dela Cruz", nickname: "Anne", role: "Child" },
      null
    )

    expect((await ana()).nickname).toBeNull()
  })
})
