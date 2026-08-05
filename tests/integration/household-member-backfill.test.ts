/**
 * Profile backfill for HOUSEHOLD members.
 *
 * The primary registrant's paths (`resolveAnonymousGuest`,
 * `resolveConfirmedGuest`, `resolveConfirmedMember`) write every answer onto
 * the profile fill-if-empty; `tests/integration/form-field-nickname` pins those.
 * The household paths only did it on the CREATE branch, so a household member
 * first added without an answer could never gain one — every later registration
 * matched the existing guest and dropped it.
 *
 * The two household paths must stay in step: whatever a household member's
 * profile gains through the registration form, it must also gain at the
 * check-in desk. The parity test at the bottom is what keeps them honest.
 *
 *  - regression: a matched household member's empty nickname, gender, birth
 *                date and age range are filled, on both the registration form
 *                and the check-in desk
 *  - edge case:  a value already on file is never overwritten; the field
 *                toggles still gate a crafted payload
 *  - unit:       the sanitizer's household gates are pinned in
 *                tests/unit/form-field-nickname
 *  - e2e:        skipped — no new UI, these are server-side write rules
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
    "Event", "Guest", "Member", "AgeRangeBucket"
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

type Toggles = {
  nickname?: boolean
  gender?: boolean
  birthDate?: boolean
  ageRange?: boolean
}

async function seedEvent(
  context: "Register" | "CheckIn" = "Register",
  { nickname = true, gender = true, birthDate = true, ageRange = true }: Toggles = {}
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
      fieldNickname: nickname,
      fieldGender: gender,
      fieldBirthDate: birthDate,
      fieldAgeRange: ageRange,
      sectionFamily: true,
    },
  })
  return event
}

async function seedBucket(label: string, order: number) {
  return db.ageRangeBucket.create({
    data: { label, minAge: order * 10, maxAge: order * 10 + 9, order },
  })
}

/** The household member under test — Ana, carrying only the answers given. */
type AnaAnswers = {
  nickname?: string | null
  gender?: "Male" | "Female" | null
  birthMonth?: number | null
  birthYear?: number | null
  ageRangeBucketId?: string | null
}

function household(answers: AnaAnswers = {}) {
  return {
    familyName: "Dela Cruz Family",
    primaryRole: "FatherHusband" as const,
    members: [
      { firstName: "Ana", lastName: "Dela Cruz", role: "Child" as const, ...answers },
    ],
  }
}

function checkinMember(answers: AnaAnswers = {}) {
  return { firstName: "Ana", lastName: "Dela Cruz", role: "Child" as const, ...answers }
}

async function ana() {
  return db.guest.findFirstOrThrow({ where: { firstName: "Ana" } })
}

describe("createHouseholdRegistration — household member backfill", () => {
  it("stores a new household member's answers on their Guest record", async () => {
    const event = await seedEvent()

    const result = await createHouseholdRegistration(
      event.id,
      PRIMARY,
      household({ nickname: "Anne", gender: "Female" }),
      null
    )

    expect(result.success).toBe(true)
    expect(await ana()).toMatchObject({ nickname: "Anne", gender: "Female" })
  })

  it("regression — fills the nickname of a household member who already exists", async () => {
    // First event: added with no nickname. Second event: the family gives one.
    // Before the fix the second registration matched the existing guest and the
    // answer was discarded, so the nickname could never be captured at all.
    const first = await seedEvent()
    const second = await seedEvent()

    await createHouseholdRegistration(first.id, PRIMARY, household(), null)
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

  it("regression — fills the gender of a household member who already exists", async () => {
    // Gender is a hard gate in the matching engine, so a household member stuck
    // at null is excluded from every gender-scoped group for good.
    const first = await seedEvent()
    const second = await seedEvent()

    await createHouseholdRegistration(first.id, PRIMARY, household(), null)
    expect((await ana()).gender).toBeNull()

    const result = await createHouseholdRegistration(
      second.id,
      PRIMARY,
      household({ gender: "Female" }),
      null
    )

    expect(result.success).toBe(true)
    expect((await ana()).gender).toBe("Female")
    expect(await db.guest.count()).toBe(2)
  })

  it("edge case — never overwrites answers the household member already has", async () => {
    const first = await seedEvent()
    const second = await seedEvent()

    await createHouseholdRegistration(
      first.id,
      PRIMARY,
      household({ nickname: "Anne", gender: "Female" }),
      null
    )
    await createHouseholdRegistration(
      second.id,
      PRIMARY,
      household({ nickname: "Annie", gender: "Male" }),
      null
    )

    expect(await ana()).toMatchObject({ nickname: "Anne", gender: "Female" })
  })

  it("edge case — drops crafted answers when the fields are off", async () => {
    const first = await seedEvent()
    const second = await seedEvent("Register", { nickname: false, gender: false })

    await createHouseholdRegistration(first.id, PRIMARY, household(), null)
    await createHouseholdRegistration(
      second.id,
      PRIMARY,
      household({ nickname: "Anne", gender: "Female" }),
      null
    )

    expect(await ana()).toMatchObject({ nickname: null, gender: null })
  })
})

describe("addHouseholdMemberAtCheckin — household member backfill", () => {
  /** A checked-in primary plus their family, so the desk can add to it. */
  async function seedCheckedInFamily(toggles: Toggles = {}) {
    const event = await seedEvent("CheckIn", toggles)
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

  it("regression — fills the empty answers of someone already on the family roster", async () => {
    const { event, registrant } = await seedCheckedInFamily()
    const bucket = await seedBucket("10–19", 1)

    const result = await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      checkinMember({
        nickname: "Anne",
        gender: "Female",
        birthMonth: 3,
        birthYear: 2014,
        ageRangeBucketId: bucket.id,
      }),
      null
    )

    expect(result.success).toBe(true)
    expect(await ana()).toMatchObject({
      nickname: "Anne",
      gender: "Female",
      birthMonth: 3,
      birthYear: 2014,
      ageRangeBucketId: bucket.id,
    })
    expect(await db.guest.count()).toBe(2)
  })

  it("edge case — never overwrites answers already on file", async () => {
    const { event, registrant, child } = await seedCheckedInFamily()
    const known = await seedBucket("10–19", 1)
    const other = await seedBucket("20–29", 2)
    await db.guest.update({
      where: { id: child.id },
      data: {
        nickname: "Anne",
        gender: "Female",
        birthMonth: 3,
        birthYear: 2014,
        ageRangeBucketId: known.id,
      },
    })

    await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      checkinMember({
        nickname: "Annie",
        gender: "Male",
        birthMonth: 7,
        birthYear: 2010,
        ageRangeBucketId: other.id,
      }),
      null
    )

    expect(await ana()).toMatchObject({
      nickname: "Anne",
      gender: "Female",
      birthMonth: 3,
      birthYear: 2014,
      ageRangeBucketId: known.id,
    })
  })

  it("edge case — the two birth-date columns move together", async () => {
    // birthMonth and birthYear are one answer on the form, so a guest holding a
    // year already must not have their month replaced from a later payload.
    const { event, registrant, child } = await seedCheckedInFamily()
    await db.guest.update({
      where: { id: child.id },
      data: { birthMonth: 3, birthYear: 2014 },
    })

    await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      checkinMember({ birthMonth: 11, birthYear: 2010 }),
      null
    )

    expect(await ana()).toMatchObject({ birthMonth: 3, birthYear: 2014 })
  })

  it("edge case — drops crafted answers when the check-in form doesn't ask", async () => {
    const { event, registrant } = await seedCheckedInFamily({
      nickname: false,
      gender: false,
      birthDate: false,
      ageRange: false,
    })
    const bucket = await seedBucket("10–19", 1)

    await addHouseholdMemberAtCheckin(
      event.id,
      registrant.id,
      checkinMember({
        nickname: "Anne",
        gender: "Female",
        birthMonth: 3,
        birthYear: 2014,
        ageRangeBucketId: bucket.id,
      }),
      null
    )

    expect(await ana()).toMatchObject({
      nickname: null,
      gender: null,
      birthMonth: null,
      birthYear: null,
      ageRangeBucketId: null,
    })
  })
})

describe("the two household paths stay in step", () => {
  /**
   * The bug this file exists for was an asymmetry, not a single omission: the
   * registration form backfilled a matched household member's profile and the
   * check-in desk did not, so the same answer was kept or dropped depending on
   * which door the family walked through. This pins the two against each other
   * on the whole gated set, so a field added to one and forgotten on the other
   * fails here rather than quietly losing data at one of the doors.
   */
  it("backfills the same fields whichever door the family came through", async () => {
    const bucket = await seedBucket("10–19", 1)
    const answers = {
      nickname: "Anne",
      gender: "Female" as const,
      birthMonth: 3,
      birthYear: 2014,
      ageRangeBucketId: bucket.id,
    }
    const expected = {
      nickname: "Anne",
      gender: "Female",
      birthMonth: 3,
      birthYear: 2014,
      ageRangeBucketId: bucket.id,
    }

    // Door 1 — the registration form, on a second event for a known family.
    const first = await seedEvent()
    const second = await seedEvent()
    await createHouseholdRegistration(first.id, PRIMARY, household(), null)
    await createHouseholdRegistration(second.id, PRIMARY, household(answers), null)
    const viaRegistration = await ana()

    // Same starting point, this time reached from the check-in desk.
    await db.guest.update({
      where: { id: viaRegistration.id },
      data: {
        nickname: null,
        gender: null,
        birthMonth: null,
        birthYear: null,
        ageRangeBucketId: null,
      },
    })
    const checkinEvent = await seedEvent("CheckIn")
    const registrant = await db.eventRegistrant.create({
      data: {
        eventId: checkinEvent.id,
        guestId: (await db.guest.findFirstOrThrow({ where: { firstName: "Juan" } })).id,
      },
    })
    await addHouseholdMemberAtCheckin(
      checkinEvent.id,
      registrant.id,
      checkinMember(answers),
      null
    )
    const viaCheckin = await ana()

    expect(viaRegistration).toMatchObject(expected)
    expect(viaCheckin).toMatchObject(expected)
  })
})
