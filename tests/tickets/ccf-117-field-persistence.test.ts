import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { FORM_FIELD_KEYS, FORM_SECTION_KEYS } from "@/lib/forms/context-config"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

/**
 * CCF-117 — a field the form is configured to collect must actually be stored.
 *
 * The form builder lets an admin turn eight personal-information fields on. Each
 * toggle is a promise: ask this, keep the answer. Two of those promises were
 * being broken, and both were found by probing rather than by reading:
 *
 *  - `ageRangeBucketId` was assembled into `createRegistrant`'s `matchingProfile`
 *    but never spread into the guest create or the guest update, so the age
 *    bracket was dropped on the *primary* path that collects it. The member
 *    branch was correct, which is exactly why it hid.
 *  - `scheduleDayOfWeek/TimeStart/TimeEnd` were stored for guests (scalar columns)
 *    but silently discarded for confirmed members, whose availability lives in the
 *    `SchedulePreference` relation the branch never wrote to.
 *
 * Rather than pin those two, this suite submits **every** field at once and
 * asserts each one landed, on both identity paths — so the next field added to
 * the builder cannot be collected-but-dropped without a failure here.
 *
 *  - regression: the two dropped fields above
 *  - integration: full-payload round-trip for guest and member
 *  - edge case:   a second registration must not clobber stored answers
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
  await db.$executeRaw`TRUNCATE
    "EventRegistrant", "Event", "Guest", "Member", "SchedulePreference",
    "AgeRangeBucket", "LifeStage"
    RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedContext() {
  const [event, lifeStage, bucket] = await Promise.all([
    db.event.create({
      data: { name: "Field Event", type: "OneTime", startDate: new Date(), endDate: new Date(),
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
      select: { id: true },
    }),
    db.lifeStage.create({ data: { name: "Young Pro", order: 1 }, select: { id: true } }),
    db.ageRangeBucket.create({
      data: { label: "30 – 39", minAge: 30, maxAge: 39, order: 3 },
      select: { id: true },
    }),
  ])
  return { eventId: event.id, lifeStageId: lifeStage.id, bucketId: bucket.id }
}

/** A submission with every configurable personal-information field filled in. */
function fullPayload(lifeStageId: string, bucketId: string) {
  return {
    firstName: "Ana",
    lastName: "Reyes",
    lifeStageId,
    gender: "Female" as const,
    birthMonth: 4,
    birthYear: 1994,
    ageRangeBucketId: bucketId,
    workCity: "Pasig",
    language: ["English", "Tagalog"],
    scheduleDayOfWeek: 3,
    scheduleTimeStart: "19:00",
    scheduleTimeEnd: "21:00",
    meetingPreference: "Hybrid" as const,
  }
}

describe("every configurable field is covered by this suite", () => {
  it("asserts all eight builder field toggles", () => {
    // Every field the builder offers must have a round-trip assertion below.
    // Stated as a subset check against the live registry rather than a frozen
    // list of eight: nickname, then mobile and email (CCF-142), each made the
    // frozen version fail without finding anything, and it sat red.
    //
    // The three identity/migration-owned fields are excluded because they are
    // not admin-authored choices — see tests/unit/form-config-registry.test.ts.
    const roundTripped = new Set([
      "fieldAgeRange",
      "fieldBirthDate",
      "fieldGender",
      "fieldLanguage",
      "fieldLifeStage",
      "fieldMeetingPreference",
      "fieldSchedule",
      "fieldWorkCity",
    ])
    const notCovered = FORM_FIELD_KEYS.filter(
      (k) => !roundTripped.has(k) && !["fieldNickname", "fieldMobile", "fieldEmail"].includes(k)
    )
    expect(notCovered, "new builder fields need round-trip assertions").toEqual([])
  })
})

describe("guest path stores every collected field", () => {
  it("round-trips the full payload onto a new guest", async () => {
    const { eventId, lifeStageId, bucketId } = await seedContext()

    const res = await createRegistrant(
      eventId,
      { ...fullPayload(lifeStageId, bucketId), mobileNumber: "09171112222" },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({
      select: {
        lifeStageId: true,
        gender: true,
        birthMonth: true,
        birthYear: true,
        ageRangeBucketId: true,
        workCity: true,
        language: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        scheduleTimeEnd: true,
        meetingPreference: true,
      },
    })

    expect(guest.lifeStageId).toBe(lifeStageId) // fieldLifeStage
    expect(guest.gender).toBe("Female") // fieldGender
    expect(guest.birthMonth).toBe(4) // fieldBirthDate
    expect(guest.birthYear).toBe(1994) // fieldBirthDate
    expect(guest.ageRangeBucketId).toBe(bucketId) // fieldAgeRange
    expect(guest.workCity).toBe("Pasig") // fieldWorkCity
    expect(guest.language).toEqual(["English", "Tagalog"]) // fieldLanguage
    expect(guest.scheduleDayOfWeek).toBe(3) // fieldSchedule
    expect(guest.scheduleTimeStart).toBe("19:00") // fieldSchedule
    expect(guest.scheduleTimeEnd).toBe("21:00") // fieldSchedule
    expect(guest.meetingPreference).toBe("Hybrid") // fieldMeetingPreference
  })

  it("fills every empty field on a returning guest", async () => {
    const { eventId, lifeStageId, bucketId } = await seedContext()
    await db.guest.create({
      data: { firstName: "Ana", lastName: "Reyes", phone: "+63 917 111 2222", language: [] },
    })

    const res = await createRegistrant(
      eventId,
      { ...fullPayload(lifeStageId, bucketId), mobileNumber: "09171112222" },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({
      select: {
        lifeStageId: true,
        gender: true,
        birthYear: true,
        ageRangeBucketId: true,
        workCity: true,
        language: true,
        scheduleDayOfWeek: true,
        meetingPreference: true,
      },
    })
    expect(guest).toEqual({
      lifeStageId,
      gender: "Female",
      birthYear: 1994,
      ageRangeBucketId: bucketId,
      workCity: "Pasig",
      language: ["English", "Tagalog"],
      scheduleDayOfWeek: 3,
      meetingPreference: "Hybrid",
    })
  })
})

describe("member path stores every collected field", () => {
  it("round-trips the full payload onto a confirmed member", async () => {
    const { eventId, lifeStageId, bucketId } = await seedContext()
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] },
      select: { id: true },
    })

    const res = await createRegistrant(eventId, fullPayload(lifeStageId, bucketId), member.id)
    expect(res.success).toBe(true)

    const after = await db.member.findUniqueOrThrow({
      where: { id: member.id },
      select: {
        lifeStageId: true,
        gender: true,
        birthMonth: true,
        birthYear: true,
        ageRangeBucketId: true,
        workCity: true,
        language: true,
        meetingPreference: true,
        schedulePreferences: { select: { dayOfWeek: true, timeStart: true, timeEnd: true } },
      },
    })

    expect(after.lifeStageId).toBe(lifeStageId)
    expect(after.gender).toBe("Female")
    expect(after.birthMonth).toBe(4)
    expect(after.birthYear).toBe(1994)
    expect(after.ageRangeBucketId).toBe(bucketId)
    expect(after.workCity).toBe("Pasig")
    expect(after.language).toEqual(["English", "Tagalog"])
    expect(after.meetingPreference).toBe("Hybrid")
    // fieldSchedule — a relation for members, not scalar columns.
    expect(after.schedulePreferences).toEqual([
      { dayOfWeek: 3, timeStart: "19:00", timeEnd: "21:00" },
    ])
  })

  it("does not add a second schedule for a member who already has one", async () => {
    // The member branch fills only what's missing; an existing answer wins.
    const { eventId, lifeStageId, bucketId } = await seedContext()
    const member = await db.member.create({
      data: {
        firstName: "Ana",
        lastName: "Reyes",
        dateJoined: new Date(),
        language: [],
        schedulePreferences: { create: { dayOfWeek: 6, timeStart: "09:00", timeEnd: "11:00" } },
      },
      select: { id: true },
    })

    expect((await createRegistrant(eventId, fullPayload(lifeStageId, bucketId), member.id)).success).toBe(true)

    const after = await db.member.findUniqueOrThrow({
      where: { id: member.id },
      select: { schedulePreferences: { select: { dayOfWeek: true, timeStart: true } } },
    })
    expect(after.schedulePreferences).toEqual([{ dayOfWeek: 6, timeStart: "09:00" }])
  })

  it("stores no schedule when the form did not ask for one", async () => {
    const { eventId, lifeStageId, bucketId } = await seedContext()
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] },
      select: { id: true },
    })

    const { scheduleDayOfWeek, scheduleTimeStart, scheduleTimeEnd, ...withoutSchedule } =
      fullPayload(lifeStageId, bucketId)
    void scheduleDayOfWeek
    void scheduleTimeStart
    void scheduleTimeEnd

    expect((await createRegistrant(eventId, withoutSchedule, member.id)).success).toBe(true)

    const after = await db.member.findUniqueOrThrow({
      where: { id: member.id },
      select: { schedulePreferences: { select: { id: true } } },
    })
    expect(after.schedulePreferences).toEqual([])
  })

  it("does not overwrite a member's existing answers on a later registration", async () => {
    const { eventId, lifeStageId, bucketId } = await seedContext()
    const other = await db.ageRangeBucket.create({
      data: { label: "40 – 49", minAge: 40, maxAge: 49, order: 4 },
      select: { id: true },
    })
    const member = await db.member.create({
      data: {
        firstName: "Ana",
        lastName: "Reyes",
        dateJoined: new Date(),
        language: ["Cebuano"],
        workCity: "Makati",
        ageRangeBucketId: other.id,
      },
      select: { id: true },
    })

    expect((await createRegistrant(eventId, fullPayload(lifeStageId, bucketId), member.id)).success).toBe(true)

    const after = await db.member.findUniqueOrThrow({
      where: { id: member.id },
      select: { workCity: true, language: true, ageRangeBucketId: true },
    })
    expect(after.workCity).toBe("Makati")
    expect(after.language).toEqual(["Cebuano"])
    expect(after.ageRangeBucketId).toBe(other.id)
  })
})

describe("Life Stage is collected independently of the DGroup section", () => {
  /**
   * Life Stage moved from the DGroup step into Personal Information, so enabling it
   * with the DGroup section OFF must still collect and store it — the case Mark hit
   * where the toggle was on and the field never appeared.
   *
   * This also exercises why the submit-side sanitizer gates matching fields on their
   * own field toggle rather than additionally on `sectionSmallGroup`: had it been
   * coupled, this move would have made the server silently discard the answer.
   */
  async function seedLifeStageOnlyEvent() {
    const [event, lifeStage] = await Promise.all([
      db.event.create({
        data: {
          name: "Life Stage Event",
          type: "OneTime",
          startDate: new Date(),
          endDate: new Date(),
          eventFormConfigs: {
            create: [{ context: "Register", fieldLifeStage: true, sectionSmallGroup: false }],
          },
        },
        select: { id: true },
      }),
      db.lifeStage.create({ data: { name: "Young Pro", order: 1 }, select: { id: true } }),
    ])
    return { eventId: event.id, lifeStageId: lifeStage.id }
  }

  it("stores a guest's life stage with the DGroup section off", async () => {
    const { eventId, lifeStageId } = await seedLifeStageOnlyEvent()

    const res = await createRegistrant(
      eventId,
      { firstName: "Ella", lastName: "Santos", mobileNumber: "09171112222", lifeStageId },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ select: { lifeStageId: true } })
    expect(guest.lifeStageId).toBe(lifeStageId)
  })

  it("stores a member's life stage with the DGroup section off", async () => {
    const { eventId, lifeStageId } = await seedLifeStageOnlyEvent()
    const member = await db.member.create({
      data: { firstName: "Ana", lastName: "Reyes", dateJoined: new Date(), language: [] },
      select: { id: true },
    })

    const res = await createRegistrant(
      eventId,
      { firstName: "Ana", lastName: "Reyes", lifeStageId },
      member.id
    )
    expect(res.success).toBe(true)

    const after = await db.member.findUniqueOrThrow({
      where: { id: member.id },
      select: { lifeStageId: true },
    })
    expect(after.lifeStageId).toBe(lifeStageId)
  })

  it("still refuses it when the Life Stage field itself is off", async () => {
    const lifeStage = await db.lifeStage.create({
      data: { name: "Young Pro", order: 1 },
      select: { id: true },
    })
    const event = await db.event.create({
      data: {
        name: "Bare Event",
        type: "OneTime",
        startDate: new Date(),
        endDate: new Date(),
        eventFormConfigs: { create: [{ context: "Register", fieldLifeStage: false }] },
      },
      select: { id: true },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Ella",
        lastName: "Santos",
        mobileNumber: "09171112222",
        lifeStageId: lifeStage.id,
      },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ select: { lifeStageId: true } })
    expect(guest.lifeStageId).toBeNull()
  })
})
