"use server"

import { headers } from "next/headers"
import { z } from "zod"
import { db } from "@/lib/db"
import { contactHintFrom, maskEmail, maskName } from "@/lib/contact-hint"
import { findExistingEventRegistration } from "@/lib/events/registration-core"
import type { RequirableKey } from "@/lib/forms/context-config"
import { getEffectiveFormConfig } from "@/lib/forms/context-config-server"
import {
  fieldsStillNeeded,
  mergedAnswersFor,
  type RegistrationProfileSnapshot,
} from "@/lib/forms/profile-prefill"
import { tryIssueIdentityGrant } from "@/lib/security/identity-grant"
import { checkRateLimit, clientIpFrom, UNKNOWN_IP_BUCKET } from "@/lib/security/rate-limit"
import { formatPhilippinePhone } from "@/lib/utils"

/**
 * Step-0 profile lookup for the public registration form (CCF-147).
 *
 * `lookupMemberForRegistration` in `./actions.ts` already owns the match ladder
 * and is deliberately left alone — it fires *after* someone has typed their
 * details, where returning their name back to them leaks nothing. These two
 * actions are the same ladder repositioned as a *gate*, and that changes the
 * threat model completely: anyone can type anyone's number into a public form,
 * so the response has to be safe to hand a stranger.
 *
 * Two rules follow, and both are enforced here rather than in the UI:
 *
 *  1. **Nothing unmasked crosses the wire before the second factor.** The first
 *     call answers only "a profile exists, and here are its initials" — never a
 *     full name, email or phone.
 *  2. **The second factor is re-checked server-side on the reveal.** The client
 *     cannot hand back a `verified: true`; it hands back a birth month and year,
 *     and this file decides.
 *
 * Both calls are rate-limited on the same per-IP bucket, so neither the number
 * space nor the birthday space can be walked at speed.
 */

// ─── Rate limiting ───────────────────────────────────────────────────────────

/**
 * Generous enough that a family sharing a phone at the door never trips it, tight
 * enough that enumeration is pointless. Lookup and reveal share one budget on
 * purpose: an attacker who could spend the whole allowance on birthdays after a
 * single cheap lookup would get the harder half of the check for free.
 */
const LOOKUP_LIMIT = 12
const LOOKUP_WINDOW_MS = 60_000

async function rateLimitOk(): Promise<boolean> {
  // No readable request context is still a caller worth counting, so it falls
  // into the shared unknown bucket rather than being waved through. Degrading to
  // "unlimited" here would make the limit removable by whatever made `headers()`
  // unavailable.
  let ip: string
  try {
    ip = clientIpFrom(await headers())
  } catch {
    ip = UNKNOWN_IP_BUCKET
  }
  return checkRateLimit(`registration-lookup:${ip}`, {
    limit: LOOKUP_LIMIT,
    windowMs: LOOKUP_WINDOW_MS,
  }).allowed
}

// ─── Public result shapes ────────────────────────────────────────────────────

export type MaskedProfileCandidate = {
  recordId: string
  recordType: "member" | "guest"
  /** `M••• S•••` — enough to recognise yourself, useless for harvesting. */
  maskedName: string
  /** `+63 ••• ••• 4567` or `m•••@gmail.com`. */
  contactHint: string | null
  /**
   * False when the record has no birth month/year on file.
   *
   * An unavoidable hole: there is no second factor to ask for, so the reveal
   * proceeds on the mask alone for these profiles. Filling in birth dates is
   * what closes it, which is a data-quality job rather than a code one.
   */
  needsSecondFactor: boolean
}

export type ProfileLookupResult =
  | { outcome: "none" }
  | { outcome: "rateLimited" }
  | ({ outcome: "match" } & MaskedProfileCandidate)
  | { outcome: "ambiguous"; candidates: MaskedProfileCandidate[] }

export type ProfileRevealResult =
  | { ok: false; reason: "mismatch" | "rateLimited" | "notFound" }
  | {
      ok: true
      profile: RegistrationProfileSnapshot
      /**
       * Proof of ownership to hand back on submit, so the write path can honour
       * an edit to a field that already has a value.
       *
       * Null when nothing was actually proven — a record with no birth month and
       * year on file has no second factor to ask for, so the reveal proceeded on
       * the mask alone (see `needsSecondFactor`). Those registrations still work;
       * they keep the fill-if-empty rule and simply cannot overwrite. Closing
       * that gap is a data-quality job — put birthdays on the records — not a
       * reason to mint a credential nobody earned.
       */
      grant: string | null
      /**
       * Whether this person already holds a registration for this event.
       *
       * Reported truthfully — including at a walk-in door, where an existing
       * registration is reused rather than refused. Deciding what to *do* about it
       * belongs to the caller, next to the volunteer check it sits beside.
       *
       * Deliberately absent from `ProfileLookupResult`. The masked lookup answers
       * to anyone who can type a phone number, so attendance status there would
       * let a stranger learn who is coming.
       *
       * Gated on the same proof as `grant`, and for the same reason: a record with
       * no birth month and year on file has no second factor to ask for, so the
       * reveal proceeds on the mask alone (see `needsSecondFactor`) and nothing has
       * been proved. Those reveals report `false` regardless of the truth — the
       * duplicate guard in `createRegistrant` still catches them at submit, which
       * is exactly where they landed before any of this existed.
       */
      alreadyRegistered: boolean
      /**
       * Enabled-and-required fields this profile still can't answer — what the
       * form would have to ask even though the person is already registered,
       * because the admin turned a field on (or made it required) after they
       * signed up.
       *
       * Never the DGroup-nested fields — `askedFieldsFor` drops those, since they
       * are put only to someone who says they're looking for a group — and never
       * `sectionPayment`, which the amend path refuses to collect. Dietary *can*
       * appear: it is one of the two requirable sections.
       */
      fieldsStillNeeded: RequirableKey[]
    }

// ─── Selects ─────────────────────────────────────────────────────────────────

const MEMBER_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  email: true,
  phone: true,
  birthMonth: true,
  birthYear: true,
  ageRangeBucketId: true,
  lifeStageId: true,
  gender: true,
  language: true,
  meetingPreference: true,
  workCity: true,
  smallGroupId: true,
  schedulePreferences: {
    select: { dayOfWeek: true, timeStart: true, timeEnd: true },
    orderBy: { createdAt: "asc" as const },
    take: 1,
  },
} as const

const GUEST_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  email: true,
  phone: true,
  birthMonth: true,
  birthYear: true,
  ageRangeBucketId: true,
  lifeStageId: true,
  gender: true,
  language: true,
  meetingPreference: true,
  workCity: true,
  scheduleDayOfWeek: true,
  scheduleTimeStart: true,
  scheduleTimeEnd: true,
  claimedSmallGroupId: true,
  claimedSatellite: true,
} as const

type MaskableRecord = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  birthMonth: number | null
  birthYear: number | null
}

function toCandidate(
  record: MaskableRecord,
  recordType: "member" | "guest"
): MaskedProfileCandidate {
  return {
    recordId: record.id,
    recordType,
    maskedName: maskName(record.firstName, record.lastName),
    contactHint: contactHintFrom(record.phone, record.email),
    needsSecondFactor: record.birthMonth != null && record.birthYear != null,
  }
}

// ─── Step 0: "what's your mobile number?" ────────────────────────────────────

const lookupSchema = z.object({
  mobileNumber: z.string().min(1),
  eventId: z.string().nullish(),
})

/**
 * Members before Guests, and only *active* guests (`memberId: null`) — the same
 * ordering and the same exclusion `lookupMemberForRegistration` applies, because
 * a guest who has been promoted is reachable through their Member record and
 * offering the stale Guest row would register them as the wrong person.
 *
 * Mobile only. The email and last-name+birthday rungs stay on the existing
 * lookup, which the form still runs later for anyone who skips this step: a
 * *gate* keyed on anything but the number people already know by heart would
 * cost more than it saves.
 */
export async function lookupProfileByMobile(
  raw: z.input<typeof lookupSchema>
): Promise<ProfileLookupResult> {
  const parsed = lookupSchema.safeParse(raw)
  if (!parsed.success) return { outcome: "none" }

  if (!(await rateLimitOk())) return { outcome: "rateLimited" }

  try {
    // Canonicalise before matching, so `+639171234567`, `0917 123 4567` and
    // `+63 917 123 4567` all resolve to the one stored record.
    const phone = formatPhilippinePhone(parsed.data.mobileNumber.trim())

    const members = await db.member.findMany({
      where: { phone },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, birthMonth: true, birthYear: true },
    })
    if (members.length > 1) {
      return { outcome: "ambiguous", candidates: members.map((m) => toCandidate(m, "member")) }
    }
    if (members.length === 1) {
      return { outcome: "match", ...toCandidate(members[0], "member") }
    }

    const guests = await db.guest.findMany({
      where: { phone, memberId: null },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, birthMonth: true, birthYear: true },
    })
    if (guests.length > 1) {
      return { outcome: "ambiguous", candidates: guests.map((g) => toCandidate(g, "guest")) }
    }
    if (guests.length === 1) {
      return { outcome: "match", ...toCandidate(guests[0], "guest") }
    }

    return { outcome: "none" }
  } catch {
    // A lookup failure must not block registration — fall through to the full
    // form rather than showing an error the person can do nothing about.
    return { outcome: "none" }
  }
}

// ─── Confirm: "yes, that's me" ───────────────────────────────────────────────

const revealSchema = z.object({
  recordId: z.string().min(1),
  recordType: z.enum(["member", "guest"]),
  birthMonth: z.number().int().min(1).max(12).nullish(),
  birthYear: z.number().int().nullish(),
  eventId: z.string().nullish(),
  /**
   * Which form is asking. The walk-in door and the public form can be configured
   * to collect different things, so "what does this profile still not answer?"
   * has a different answer for each and has to be resolved against the right one.
   */
  context: z.enum(["Register", "WalkIn"]).default("Register"),
})

/**
 * Where a revealed profile stands with this event: are they on the list already,
 * and does the form as it stands today ask them anything their profile can't
 * answer?
 *
 * Both are null-event-safe. The cluster form resolves a person before it knows
 * which events they'll pick, so it reveals with no event at all and gets the
 * neutral answer rather than a special case.
 *
 * `proven` is whether this reveal actually demanded a second factor. Only
 * `alreadyRegistered` depends on it: that one is a fact about the *event*, and
 * withholding it is what stops a phone number alone from telling a stranger who
 * is coming. `fieldsStillNeeded` is derived from the profile that was just
 * returned and a form config the public form renders anyway, so it discloses
 * nothing the caller doesn't already hold.
 */
async function resolveEventStanding(
  eventId: string | null | undefined,
  context: "Register" | "WalkIn",
  recordId: string,
  recordType: "member" | "guest",
  profile: RegistrationProfileSnapshot,
  proven: boolean
): Promise<{ alreadyRegistered: boolean; fieldsStillNeeded: RequirableKey[] }> {
  if (!eventId) return { alreadyRegistered: false, fieldsStillNeeded: [] }

  const [existingRegistrationId, config] = await Promise.all([
    proven
      ? findExistingEventRegistration(
          eventId,
          recordType === "member" ? { memberId: recordId } : { guestId: recordId }
        )
      : null,
    getEffectiveFormConfig(eventId, context),
  ])

  /**
   * Dietary and Payment are answered on the `EventRegistrant`, not on the person,
   * so the profile snapshot cannot speak for them. Without this an already-
   * registered person would be told the event still needs a dietary preference
   * they gave when they signed up.
   */
  const storedAnswers = existingRegistrationId
    ? await db.eventRegistrant.findUnique({
        where: { id: existingRegistrationId },
        select: { dietaryPreference: true, dietaryOther: true, paymentReference: true },
      })
    : null

  return {
    alreadyRegistered: existingRegistrationId !== null,
    // The same pair the form itself runs, rather than a second "is this done?"
    // rule that could drift from it.
    fieldsStillNeeded: fieldsStillNeeded(
      config,
      context,
      mergedAnswersFor(profile, { ...storedAnswers })
    )
      // Payment is never amendable from a public form — `createRegistrant` strips
      // it on the amend path — so naming it here would promise a question the
      // flow then refuses to ask. A *new* registration still has it enforced.
      .filter((key) => key !== "sectionPayment"),
  }
}

/**
 * Reveal a profile once the person has proved they know its birth month + year.
 *
 * The check runs here and only here. `needsSecondFactor` from the lookup is a
 * hint for what the UI should render, not a permission the client can assert —
 * a crafted POST that omits the birthday reaches the same branch as an honest
 * one, and is refused unless the record genuinely has no birthday to check.
 *
 * A wrong answer returns `mismatch` without saying which half was wrong, and
 * without distinguishing "no such record" from "wrong birthday" any more than it
 * has to: both burn the same rate-limit budget.
 */
export async function revealProfileForRegistration(
  raw: z.input<typeof revealSchema>
): Promise<ProfileRevealResult> {
  const parsed = revealSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: "mismatch" }

  if (!(await rateLimitOk())) return { ok: false, reason: "rateLimited" }

  const { recordId, recordType, birthMonth, birthYear, eventId, context } = parsed.data

  try {
    const record =
      recordType === "member"
        ? await db.member.findUnique({ where: { id: recordId }, select: MEMBER_PROFILE_SELECT })
        : await db.guest.findUnique({ where: { id: recordId }, select: GUEST_PROFILE_SELECT })

    if (!record) return { ok: false, reason: "notFound" }

    const hasStoredBirthday = record.birthMonth != null && record.birthYear != null
    if (hasStoredBirthday) {
      if (birthMonth !== record.birthMonth || birthYear !== record.birthYear) {
        return { ok: false, reason: "mismatch" }
      }
    }

    // Volunteers are told they're already on the list instead of registering as
    // attendees. Resolved here so the fast path reaches the same screen the
    // existing confirm step does.
    const isVolunteer =
      recordType === "member" && eventId
        ? !!(await db.volunteer.findFirst({
            where: { memberId: recordId, eventId },
            select: { id: true },
          }))
        : false

    const schedule =
      recordType === "member"
        ? (record as { schedulePreferences: { dayOfWeek: number; timeStart: string | null; timeEnd: string | null }[] })
            .schedulePreferences[0] ?? null
        : {
            dayOfWeek: (record as { scheduleDayOfWeek: number | null }).scheduleDayOfWeek,
            timeStart: (record as { scheduleTimeStart: string | null }).scheduleTimeStart,
            timeEnd: (record as { scheduleTimeEnd: string | null }).scheduleTimeEnd,
          }

    const profile: RegistrationProfileSnapshot = {
      recordId: record.id,
      recordType,
      firstName: record.firstName,
      lastName: record.lastName,
      nickname: record.nickname,
      email: record.email,
      emailMasked: record.email ? maskEmail(record.email) : null,
      phone: record.phone,
      birthMonth: record.birthMonth,
      birthYear: record.birthYear,
      ageRangeBucketId: record.ageRangeBucketId,
      lifeStageId: record.lifeStageId,
      gender: record.gender,
      language: record.language,
      meetingPreference: record.meetingPreference,
      workCity: record.workCity,
      scheduleDayOfWeek: schedule?.dayOfWeek ?? null,
      scheduleTimeStart: schedule?.timeStart ?? null,
      scheduleTimeEnd: schedule?.timeEnd ?? null,
      smallGroupId:
        recordType === "member" ? (record as { smallGroupId: string | null }).smallGroupId : null,
      claimedSmallGroupId:
        recordType === "guest"
          ? (record as { claimedSmallGroupId: string | null }).claimedSmallGroupId
          : null,
      claimedSatellite:
        recordType === "guest"
          ? (record as { claimedSatellite: string | null }).claimedSatellite
          : null,
      isVolunteer,
    }

    const standing = await resolveEventStanding(
      eventId,
      context,
      record.id,
      recordType,
      profile,
      hasStoredBirthday
    )

    return {
      ok: true,
      profile,
      grant: hasStoredBirthday ? tryIssueIdentityGrant({ recordId: record.id, recordType }) : null,
      ...standing,
    }
  } catch {
    return { ok: false, reason: "notFound" }
  }
}
