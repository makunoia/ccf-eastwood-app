/**
 * CCF-147 — the step-0 lookup is a *disclosure boundary*, not a convenience.
 *
 * Anyone can type anyone's mobile number into a public registration form, so the
 * assertions here are the security contract: the first call may never hand back
 * an unmasked name, email or phone, and the reveal must re-check the birthday
 * server-side rather than trusting anything the client says about it.
 *
 * Everything below bypasses the UI entirely and calls the actions the way a
 * crafted POST would.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import {
  lookupProfileByMobile,
  revealProfileForRegistration,
} from "@/app/(dashboard)/events/registration-lookup-actions"
import { resetRateLimits } from "@/lib/security/rate-limit"
import { verifyIdentityGrant } from "@/lib/security/identity-grant"

// `headers()` has no request context in a test runner. The action falls back to
// the shared unknown bucket, which is exactly the path this mock exercises.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map<string, string>()),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "Event", "EventRegistrant", "EventFormConfig", "Volunteer", "LifeStage" RESTART IDENTITY CASCADE`
  resetRateLimits()
})

afterAll(async () => {
  await db.$disconnect()
})

const MOBILE = "+63 917 123 4567"

async function seedMember(overrides: Record<string, unknown> = {}) {
  return db.member.create({
    data: {
      firstName: "Maria",
      lastName: "Santos",
      email: "maria@example.com",
      phone: MOBILE,
      birthMonth: 4,
      birthYear: 1992,
      dateJoined: new Date(),
      language: [],
      ...overrides,
    },
  })
}

async function seedGuest(overrides: Record<string, unknown> = {}) {
  return db.guest.create({
    data: {
      firstName: "Juan",
      lastName: "dela Cruz",
      email: "juan@example.com",
      phone: MOBILE,
      birthMonth: 9,
      birthYear: 1988,
      language: [],
      ...overrides,
    },
  })
}

describe("lookupProfileByMobile — what escapes to an unauthenticated caller", () => {
  it("returns initials only, never the stored name, email or phone", async () => {
    await seedMember()
    const result = await lookupProfileByMobile({ mobileNumber: MOBILE })

    expect(result.outcome).toBe("match")
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("Maria")
    expect(serialized).not.toContain("Santos")
    expect(serialized).not.toContain("maria@example.com")
    expect(serialized).not.toContain("123 4567")

    if (result.outcome !== "match") throw new Error("expected a match")
    expect(result.maskedName).toBe("M••• S•••")
    expect(result.contactHint).toBe("+63 ••• ••• 4567")
    expect(result.needsSecondFactor).toBe(true)
  })

  it("never says whether that person is attending", async () => {
    // Attendance is a fact about someone's movements, and this call answers to
    // anyone who can type a phone number. It belongs behind the second factor with
    // the rest of the profile — the reveal reports it, this must not.
    const member = await seedMember()
    const event = await db.event.create({
      data: {
        name: "Youth Camp", type: "OneTime",
        startDate: new Date("2026-09-01"), endDate: new Date("2026-09-01"),
      },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const result = await lookupProfileByMobile({ mobileNumber: MOBILE, eventId: event.id })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("alreadyRegistered")
    expect(serialized).not.toContain("fieldsStillNeeded")
    expect(serialized).not.toContain("grant")
  })

  it("masks every candidate on the ambiguous path too", async () => {
    await seedMember()
    await seedMember({ firstName: "Mario", lastName: "Santos", email: "mario@example.com" })

    const result = await lookupProfileByMobile({ mobileNumber: MOBILE })
    expect(result.outcome).toBe("ambiguous")
    if (result.outcome !== "ambiguous") throw new Error("expected ambiguous")
    expect(result.candidates).toHaveLength(2)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("Mario")
    expect(serialized).not.toContain("Santos")
  })

  it("says nothing at all for a number we don't hold", async () => {
    await seedMember()
    expect(await lookupProfileByMobile({ mobileNumber: "+63 999 000 1111" })).toEqual({
      outcome: "none",
    })
  })

  it("flags a profile with no birthday as having no second factor to ask for", async () => {
    await seedMember({ birthMonth: null, birthYear: null })
    const result = await lookupProfileByMobile({ mobileNumber: MOBILE })
    if (result.outcome !== "match") throw new Error("expected a match")
    expect(result.needsSecondFactor).toBe(false)
  })
})

describe("lookupProfileByMobile — matching", () => {
  it("resolves every input format to the one stored record", async () => {
    const member = await seedMember()
    for (const typed of ["+639171234567", "0917 123 4567", "+63 917 123 4567", "09171234567"]) {
      resetRateLimits()
      const result = await lookupProfileByMobile({ mobileNumber: typed })
      if (result.outcome !== "match") throw new Error(`no match for ${typed}`)
      expect(result.recordId).toBe(member.id)
    }
  })

  it("prefers a Member over a Guest on the same number", async () => {
    const member = await seedMember()
    await seedGuest()
    const result = await lookupProfileByMobile({ mobileNumber: MOBILE })
    if (result.outcome !== "match") throw new Error("expected a match")
    expect(result.recordType).toBe("member")
    expect(result.recordId).toBe(member.id)
  })

  it("ignores a guest who has already been promoted to a member", async () => {
    const member = await db.member.create({
      data: {
        firstName: "Ana", lastName: "Reyes", phone: "+63 918 222 3333",
        dateJoined: new Date(), language: [],
      },
    })
    await seedGuest({ phone: "+63 918 222 3333", memberId: member.id })
    // The Member itself carries that number, so the match is the Member — the
    // stale Guest row must not be offered as a second candidate.
    const result = await lookupProfileByMobile({ mobileNumber: "+63 918 222 3333" })
    if (result.outcome !== "match") throw new Error("expected a match")
    expect(result.recordType).toBe("member")
  })

  it("finds an active guest when no member holds the number", async () => {
    const guest = await seedGuest()
    const result = await lookupProfileByMobile({ mobileNumber: MOBILE })
    if (result.outcome !== "match") throw new Error("expected a match")
    expect(result.recordType).toBe("guest")
    expect(result.recordId).toBe(guest.id)
  })
})

describe("revealProfileForRegistration — the second factor", () => {
  it("refuses a wrong birth month", async () => {
    const member = await seedMember()
    const result = await revealProfileForRegistration({
      recordId: member.id,
      recordType: "member",
      birthMonth: 5,
      birthYear: 1992,
    })
    expect(result).toEqual({ ok: false, reason: "mismatch" })
  })

  it("refuses a wrong birth year", async () => {
    const member = await seedMember()
    const result = await revealProfileForRegistration({
      recordId: member.id,
      recordType: "member",
      birthMonth: 4,
      birthYear: 1991,
    })
    expect(result).toEqual({ ok: false, reason: "mismatch" })
  })

  it("refuses an omitted birthday — the client cannot opt out of the check", async () => {
    const member = await seedMember()
    const result = await revealProfileForRegistration({
      recordId: member.id,
      recordType: "member",
      birthMonth: null,
      birthYear: null,
    })
    expect(result).toEqual({ ok: false, reason: "mismatch" })
  })

  it("reveals the profile on the right answer, with the email masked for display", async () => {
    const member = await seedMember({ workCity: "Makati", gender: "Female" })
    const result = await revealProfileForRegistration({
      recordId: member.id,
      recordType: "member",
      birthMonth: 4,
      birthYear: 1992,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.profile.firstName).toBe("Maria")
    expect(result.profile.workCity).toBe("Makati")
    expect(result.profile.email).toBe("maria@example.com")
    expect(result.profile.emailMasked).toBe("m•••@example.com")
    expect(result.profile.isVolunteer).toBe(false)
  })

  it("proceeds on the mask alone when there is no birthday to check", async () => {
    const member = await seedMember({ birthMonth: null, birthYear: null })
    const result = await revealProfileForRegistration({
      recordId: member.id,
      recordType: "member",
      birthMonth: null,
      birthYear: null,
    })
    expect(result.ok).toBe(true)
  })

  it("reports a record that isn't there", async () => {
    const result = await revealProfileForRegistration({
      recordId: "does-not-exist",
      recordType: "member",
      birthMonth: 4,
      birthYear: 1992,
    })
    expect(result).toEqual({ ok: false, reason: "notFound" })
  })

  it("flattens a member's schedule relation into the snapshot's scalar fields", async () => {
    const member = await seedMember()
    await db.schedulePreference.create({
      data: { memberId: member.id, dayOfWeek: 2, timeStart: "19:00", timeEnd: "21:00" },
    })
    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member", birthMonth: 4, birthYear: 1992,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.profile.scheduleDayOfWeek).toBe(2)
    expect(result.profile.scheduleTimeStart).toBe("19:00")
  })

  it("marks a member serving at this event so they hit the volunteer screen", async () => {
    const member = await seedMember()
    const event = await db.event.create({
      data: {
        name: "Youth Camp", type: "OneTime",
        startDate: new Date("2026-09-01"), endDate: new Date("2026-09-01"),
      },
    })
    const committee = await db.volunteerCommittee.create({
      data: { name: "Ushers", eventId: event.id },
    })
    const role = await db.committeeRole.create({
      data: { name: "Greeter", committeeId: committee.id },
    })
    await db.volunteer.create({
      data: {
        memberId: member.id, eventId: event.id,
        committeeId: committee.id, preferredRoleId: role.id,
      },
    })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.profile.isVolunteer).toBe(true)
  })

  it("mints an ownership grant once the birthday checks out", async () => {
    const member = await seedMember()
    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member", birthMonth: 4, birthYear: 1992,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(verifyIdentityGrant(result.grant, { recordId: member.id, recordType: "member" })).toBe(true)
  })

  it("mints no grant when there was no birthday to check", async () => {
    // The documented hole: with nothing to ask, the reveal proceeds on the mask
    // alone. It must not also hand over the privilege to overwrite — that would
    // turn a data-quality gap into an authorisation one.
    const member = await seedMember({ birthMonth: null, birthYear: null })
    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.grant).toBeNull()
  })
})

/**
 * Where a revealed profile stands with the event doing the asking. Both facts are
 * this side of the second factor on purpose — see the privacy assertion in the
 * lookup block above.
 */
describe("revealProfileForRegistration — standing with the event", () => {
  async function seedEvent(config: Record<string, unknown> = {}) {
    const event = await db.event.create({
      data: {
        name: "Youth Camp", type: "OneTime",
        startDate: new Date("2026-09-01"), endDate: new Date("2026-09-01"),
      },
    })
    await db.eventFormConfig.create({
      data: { eventId: event.id, context: "Register", ...config },
    })
    return event
  }

  it("says nothing is amiss for someone who hasn't registered", async () => {
    const member = await seedMember()
    const event = await seedEvent()

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.alreadyRegistered).toBe(false)
  })

  it("reports an existing registration, so the form can say so before it starts", async () => {
    const member = await seedMember()
    const event = await seedEvent()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.alreadyRegistered).toBe(true)
  })

  it("reports a guest's registration too", async () => {
    const guest = await seedGuest()
    const event = await seedEvent()
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    const result = await revealProfileForRegistration({
      recordId: guest.id, recordType: "guest",
      birthMonth: 9, birthYear: 1988, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.alreadyRegistered).toBe(true)
  })

  it("doesn't confuse one event's registration for another's", async () => {
    const member = await seedMember()
    const [asked, other] = [await seedEvent(), await seedEvent()]
    await db.eventRegistrant.create({ data: { eventId: other.id, memberId: member.id } })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: asked.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.alreadyRegistered).toBe(false)
  })

  it("stays neutral with no event — the cluster form reveals before it knows", async () => {
    const member = await seedMember()
    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member", birthMonth: 4, birthYear: 1992,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.alreadyRegistered).toBe(false)
    expect(result.fieldsStillNeeded).toEqual([])
  })

  it("names a field the event started requiring after they signed up", async () => {
    const member = await seedMember({ lifeStageId: null })
    const event = await seedEvent({ fieldLifeStage: true, fieldLifeStageRequired: true })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.fieldsStillNeeded).toContain("fieldLifeStage")
  })

  it("doesn't ask for a required field the profile already answers", async () => {
    const lifeStage = await db.lifeStage.create({ data: { name: "Young Pro", order: 1 } })
    const member = await seedMember({ lifeStageId: lifeStage.id })
    const event = await seedEvent({ fieldLifeStage: true, fieldLifeStageRequired: true })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.fieldsStillNeeded).not.toContain("fieldLifeStage")
  })

  it("doesn't ask for a field that is enabled but not required", async () => {
    // Enabling an optional question must not summon back everyone who already
    // registered — only a field the event now *demands* is worth interrupting for.
    const member = await seedMember({ lifeStageId: null })
    const event = await seedEvent({ fieldLifeStage: true })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.fieldsStillNeeded).toEqual([])
  })

  it("withholds attendance from a reveal that proved nothing", async () => {
    // A record with no birthday on file has no second factor to ask for, so the
    // reveal proceeds on the mask alone — anyone who can type the mobile number
    // gets here. Reporting attendance would make that phone number enough to
    // learn who is coming, which is the leak the masked lookup withholds on
    // purpose. The duplicate guard in `createRegistrant` still catches them.
    const member = await seedMember({ birthMonth: null, birthYear: null })
    const event = await seedEvent()
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: null, birthYear: null, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.grant).toBeNull()
    expect(result.alreadyRegistered).toBe(false)
  })

  it("still reports what the form has to ask a birthday-less profile", async () => {
    // `fieldsStillNeeded` is derived from the profile just returned and a config
    // the public form renders anyway, so unlike `alreadyRegistered` it discloses
    // nothing new and stays on.
    const member = await seedMember({ birthMonth: null, birthYear: null, lifeStageId: null })
    const event = await seedEvent({ fieldLifeStage: true, fieldLifeStageRequired: true })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: null, birthYear: null, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.fieldsStillNeeded).toContain("fieldLifeStage")
  })

  it("resolves against the context that asked, not always Register", async () => {
    // The door and the public form are configured separately, so the same profile
    // can be complete for one and short for the other.
    const member = await seedMember({ lifeStageId: null })
    const event = await db.event.create({
      data: {
        name: "Youth Camp", type: "OneTime",
        startDate: new Date("2026-09-01"), endDate: new Date("2026-09-01"),
      },
    })
    await db.eventFormConfig.createMany({
      data: [
        { eventId: event.id, context: "Register" },
        { eventId: event.id, context: "WalkIn", fieldLifeStage: true, fieldLifeStageRequired: true },
      ],
    })

    const asRegister = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id, context: "Register",
    })
    const asWalkIn = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id, context: "WalkIn",
    })
    if (!asRegister.ok || !asWalkIn.ok) throw new Error("expected a reveal")

    expect(asRegister.fieldsStillNeeded).toEqual([])
    expect(asWalkIn.fieldsStillNeeded).toContain("fieldLifeStage")
  })

  /**
   * The scenario this whole flow was built for: catering firms up, the admin adds
   * a required dietary question, and the people who registered last month have
   * never been asked it.
   */
  it("names a Dietary section the event started requiring", async () => {
    const member = await seedMember()
    const event = await seedEvent({ sectionDietary: true, sectionDietaryRequired: true })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.fieldsStillNeeded).toContain("sectionDietary")
  })

  it("doesn't re-ask someone who already gave a dietary preference", async () => {
    // Dietary lives on the registrant, not the person, so the profile snapshot
    // can't speak for it — the answer has to be read off the registration or
    // everyone gets asked again.
    const member = await seedMember()
    const event = await seedEvent({ sectionDietary: true, sectionDietaryRequired: true })
    await db.eventRegistrant.create({
      data: { eventId: event.id, memberId: member.id, dietaryPreference: "Vegan" },
    })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.fieldsStillNeeded).not.toContain("sectionDietary")
  })

  it("never names Payment, which the amend path refuses to collect", async () => {
    // Promising a question the flow then declines to ask would be worse than not
    // mentioning it. A *new* registration still has it enforced at submit.
    const member = await seedMember()
    const event = await seedEvent({ sectionPayment: true, sectionPaymentRequired: true })
    await db.eventRegistrant.create({ data: { eventId: event.id, memberId: member.id } })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.fieldsStillNeeded).not.toContain("sectionPayment")
  })

  it("never demands a DGroup-step field of someone who isn't seeking a group", async () => {
    // Those questions are put only to a person who says they're looking, so making
    // one required can't be allowed to strand everybody else on a screen they were
    // never meant to see.
    const member = await seedMember({ workCity: null })
    const event = await seedEvent({
      sectionSmallGroup: true, fieldWorkCity: true, fieldWorkCityRequired: true,
    })

    const result = await revealProfileForRegistration({
      recordId: member.id, recordType: "member",
      birthMonth: 4, birthYear: 1992, eventId: event.id,
    })
    if (!result.ok) throw new Error("expected a reveal")
    expect(result.fieldsStillNeeded).not.toContain("fieldWorkCity")
  })
})

describe("rate limiting", () => {
  it("stops the number space being walked, across both actions", async () => {
    await seedMember()
    // Lookup and reveal share one budget, so a cheap lookup can't buy extra
    // birthday guesses.
    for (let i = 0; i < 12; i++) {
      expect((await lookupProfileByMobile({ mobileNumber: MOBILE })).outcome).not.toBe(
        "rateLimited"
      )
    }
    expect((await lookupProfileByMobile({ mobileNumber: MOBILE })).outcome).toBe("rateLimited")
    expect(
      await revealProfileForRegistration({
        recordId: "x", recordType: "member", birthMonth: 4, birthYear: 1992,
      })
    ).toEqual({ ok: false, reason: "rateLimited" })
  })
})
