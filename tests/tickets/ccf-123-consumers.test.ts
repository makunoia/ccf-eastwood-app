import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { FORM_FIELD_KEYS, FORM_SECTION_KEYS } from "@/lib/forms/context-config"
import { createGuest, updateGuest, saveGuestMatchingProfile } from "@/app/(dashboard)/guests/actions"
import { createMember, updateMember } from "@/app/(dashboard)/members/actions"
import { createRegistrant } from "@/app/(dashboard)/events/actions"
import { defaultGuestForm } from "@/lib/validations/guest"
import { defaultMemberForm } from "@/lib/validations/member"

/**
 * CCF-123 consumers — the Age Range bracket has to survive every path that
 * writes a Member or Guest profile, and be editable from the admin forms.
 *
 *  - integration: create/update on both entities persist the bracket
 *  - regression:  `saveGuestMatchingProfile` no longer erases columns the caller
 *                 didn't send. It used to overwrite every column unconditionally,
 *                 so the guest match section (which omits birthMonth, birthYear
 *                 and ageRangeBucketId) and the catch-mech match section (which
 *                 additionally omits gender and the whole schedule) silently
 *                 wiped data collected at registration on every save.
 *  - edge case:   an explicit null still clears; an empty form string means "unset".
 */

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
  await db.$executeRaw`TRUNCATE "EventRegistrant", "Event", "Member", "Guest", "AgeRangeBucket", "LifeStage"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedBucket(label = "30 – 39") {
  return db.ageRangeBucket.create({
    data: { label, minAge: 30, maxAge: 39, order: 3 },
    select: { id: true },
  })
}

describe("admin forms persist the age bracket", () => {
  it("createMember stores the selected bracket", async () => {
    const bucket = await seedBucket()
    const res = await createMember({
      ...defaultMemberForm,
      firstName: "Ana",
      lastName: "Reyes",
      ageRangeBucketId: bucket.id,
    })
    expect(res.success).toBe(true)
    if (!res.success) return

    const member = await db.member.findUniqueOrThrow({
      where: { id: res.data.id },
      select: { ageRangeBucketId: true },
    })
    expect(member.ageRangeBucketId).toBe(bucket.id)
  })

  it("updateMember can set and then clear the bracket", async () => {
    const bucket = await seedBucket()
    const created = await createMember({
      ...defaultMemberForm,
      firstName: "Ana",
      lastName: "Reyes",
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    const form = { ...defaultMemberForm, firstName: "Ana", lastName: "Reyes" }

    expect((await updateMember(created.data.id, { ...form, ageRangeBucketId: bucket.id })).success).toBe(true)
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: created.data.id }, select: { ageRangeBucketId: true } }))
        .ageRangeBucketId
    ).toBe(bucket.id)

    // An empty string from the "Not specified" option clears it.
    expect((await updateMember(created.data.id, { ...form, ageRangeBucketId: "" })).success).toBe(true)
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: created.data.id }, select: { ageRangeBucketId: true } }))
        .ageRangeBucketId
    ).toBeNull()
  })

  it("createGuest and updateGuest store the selected bracket", async () => {
    const bucket = await seedBucket()
    const created = await createGuest({
      ...defaultGuestForm,
      firstName: "Ella",
      lastName: "Santos",
      ageRangeBucketId: bucket.id,
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    expect(
      (await db.guest.findUniqueOrThrow({ where: { id: created.data.id }, select: { ageRangeBucketId: true } }))
        .ageRangeBucketId
    ).toBe(bucket.id)

    const other = await seedBucket("40 – 49")
    expect(
      (
        await updateGuest(created.data.id, {
          ...defaultGuestForm,
          firstName: "Ella",
          lastName: "Santos",
          ageRangeBucketId: other.id,
        })
      ).success
    ).toBe(true)
    expect(
      (await db.guest.findUniqueOrThrow({ where: { id: created.data.id }, select: { ageRangeBucketId: true } }))
        .ageRangeBucketId
    ).toBe(other.id)
  })
})

describe("regression: public registration stores the age bracket it collected", () => {
  /**
   * Found by probe, not by the original implementation. `createRegistrant` built
   * a `matchingProfile` object containing `ageRangeBucketId` but never spread it
   * into either the new-guest create or the existing-guest update — so the
   * bracket was dropped on the *primary* path that collects it. The member
   * branch was fine, which is why it went unnoticed: members kept it, guests
   * (the majority of public registrants) silently lost it.
   */
  async function seedEventAndBucket() {
    const event = await db.event.create({
      data: { name: "Registration Event", type: "OneTime", startDate: new Date(), endDate: new Date(),
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
      select: { id: true },
    })
    const bucket = await seedBucket()
    return { eventId: event.id, bucketId: bucket.id }
  }

  it("stores the bracket on a brand-new guest", async () => {
    const { eventId, bucketId } = await seedEventAndBucket()

    const res = await createRegistrant(
      eventId,
      { firstName: "Ella", lastName: "Santos", mobileNumber: "09171112222", ageRangeBucketId: bucketId },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ select: { ageRangeBucketId: true } })
    expect(guest.ageRangeBucketId).toBe(bucketId)
  })

  it("fills the bracket on a returning guest who had none", async () => {
    const { eventId, bucketId } = await seedEventAndBucket()
    await db.guest.create({
      data: { firstName: "Ella", lastName: "Santos", phone: "+63 917 111 2222", language: [] },
    })

    const res = await createRegistrant(
      eventId,
      { firstName: "Ella", lastName: "Santos", mobileNumber: "09171112222", ageRangeBucketId: bucketId },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ select: { ageRangeBucketId: true } })
    expect(guest.ageRangeBucketId).toBe(bucketId)
  })

  it("does not overwrite a returning guest's existing bracket with a blank one", async () => {
    const { eventId, bucketId } = await seedEventAndBucket()
    await db.guest.create({
      data: {
        firstName: "Ella",
        lastName: "Santos",
        phone: "+63 917 111 2222",
        language: [],
        ageRangeBucketId: bucketId,
      },
    })

    // Registering again on a form that no longer asks for Age Range.
    const res = await createRegistrant(
      eventId,
      { firstName: "Ella", lastName: "Santos", mobileNumber: "09171112222" },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ select: { ageRangeBucketId: true } })
    expect(guest.ageRangeBucketId).toBe(bucketId)
  })

  it("fills the bracket on a confirmed member who had none", async () => {
    const { eventId, bucketId } = await seedEventAndBucket()
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] },
      select: { id: true },
    })

    const res = await createRegistrant(
      eventId,
      { firstName: "Ana", lastName: "Reyes", ageRangeBucketId: bucketId },
      member.id
    )
    expect(res.success).toBe(true)

    const after = await db.member.findUniqueOrThrow({
      where: { id: member.id },
      select: { ageRangeBucketId: true },
    })
    expect(after.ageRangeBucketId).toBe(bucketId)
  })
})

describe("regression: saveGuestMatchingProfile only writes what it is sent", () => {
  /** A guest with every profile column populated, as registration would leave it. */
  async function seedFullGuest() {
    const bucket = await seedBucket()
    const guest = await db.guest.create({
      data: {
        firstName: "Ella",
        lastName: "Santos",
        gender: "Female",
        language: ["English"],
        birthMonth: 4,
        birthYear: 1994,
        ageRangeBucketId: bucket.id,
        workCity: "Pasig",
        workIndustry: "Tech",
        meetingPreference: "Hybrid",
        scheduleDayOfWeek: 3,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
      },
      select: { id: true },
    })
    return { guestId: guest.id, bucketId: bucket.id }
  }

  it("keeps birth date and bracket when the guest match section saves", async () => {
    const { guestId, bucketId } = await seedFullGuest()

    // Exactly what app/(dashboard)/guests/[id]/guest-match-section.tsx sends.
    const res = await saveGuestMatchingProfile(guestId, {
      lifeStageId: null,
      gender: "Female",
      language: ["English"],
      workCity: "Pasig",
      workIndustry: "Tech",
      meetingPreference: "Hybrid",
      scheduleDayOfWeek: 3,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    })
    expect(res.success).toBe(true)

    const after = await db.guest.findUniqueOrThrow({
      where: { id: guestId },
      select: { birthMonth: true, birthYear: true, ageRangeBucketId: true },
    })
    expect(after.birthMonth).toBe(4)
    expect(after.birthYear).toBe(1994)
    expect(after.ageRangeBucketId).toBe(bucketId)
  })

  it("keeps gender, birth date, schedule and bracket when the catch-mech section saves", async () => {
    const { guestId, bucketId } = await seedFullGuest()

    // Exactly what the catch-mech match section sends — five fields only.
    const res = await saveGuestMatchingProfile(guestId, {
      lifeStageId: null,
      language: ["English"],
      meetingPreference: "Hybrid",
      workCity: "Pasig",
      workIndustry: "Tech",
    })
    expect(res.success).toBe(true)

    const after = await db.guest.findUniqueOrThrow({
      where: { id: guestId },
      select: {
        gender: true,
        birthMonth: true,
        birthYear: true,
        ageRangeBucketId: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        scheduleTimeEnd: true,
      },
    })
    expect(after.gender).toBe("Female")
    expect(after.birthMonth).toBe(4)
    expect(after.birthYear).toBe(1994)
    expect(after.ageRangeBucketId).toBe(bucketId)
    expect(after.scheduleDayOfWeek).toBe(3)
    expect(after.scheduleTimeStart).toBe("19:00")
    expect(after.scheduleTimeEnd).toBe("21:00")
  })

  it("still clears a column when the caller explicitly sends null", async () => {
    // Callers that mean to clear a field must keep working — the check-in flow
    // relies on this to blank a value the person removed.
    const { guestId } = await seedFullGuest()

    expect((await saveGuestMatchingProfile(guestId, { ageRangeBucketId: null, workCity: null })).success).toBe(true)

    const after = await db.guest.findUniqueOrThrow({
      where: { id: guestId },
      select: { ageRangeBucketId: true, workCity: true, birthYear: true },
    })
    expect(after.ageRangeBucketId).toBeNull()
    expect(after.workCity).toBeNull()
    // Untouched keys are still untouched.
    expect(after.birthYear).toBe(1994)
  })

  it("writes nothing at all when sent an empty patch", async () => {
    const { guestId, bucketId } = await seedFullGuest()

    expect((await saveGuestMatchingProfile(guestId, {})).success).toBe(true)

    const after = await db.guest.findUniqueOrThrow({
      where: { id: guestId },
      select: { gender: true, birthYear: true, ageRangeBucketId: true, language: true, workCity: true },
    })
    expect(after.gender).toBe("Female")
    expect(after.birthYear).toBe(1994)
    expect(after.ageRangeBucketId).toBe(bucketId)
    expect(after.language).toEqual(["English"])
    expect(after.workCity).toBe("Pasig")
  })

  it("clears the language list when sent an explicit empty array", async () => {
    const { guestId } = await seedFullGuest()

    expect((await saveGuestMatchingProfile(guestId, { language: [] })).success).toBe(true)

    const after = await db.guest.findUniqueOrThrow({
      where: { id: guestId },
      select: { language: true },
    })
    expect(after.language).toEqual([])
  })
})
