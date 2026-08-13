"use server"

import { headers } from "next/headers"
import { z } from "zod"
import { db } from "@/lib/db"
import { contactHintFrom, maskEmail, maskName } from "@/lib/contact-hint"
import type { RegistrationProfileSnapshot } from "@/lib/forms/profile-prefill"
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
  | { ok: true; profile: RegistrationProfileSnapshot }

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
})

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

  const { recordId, recordType, birthMonth, birthYear, eventId } = parsed.data

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

    return { ok: true, profile }
  } catch {
    return { ok: false, reason: "notFound" }
  }
}
