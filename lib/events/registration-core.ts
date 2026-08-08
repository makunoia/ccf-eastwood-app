import "server-only"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { suggestBreakoutGroup } from "@/lib/breakout-suggestion"
import { fetchBreakoutCandidates } from "@/lib/breakout-suggestion-server"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"
import { tryCreateSmallGroupRequestFromBreakout } from "@/lib/create-small-group-request"
import { createSeekerRequestFromRegistration } from "@/lib/small-groups/seeker-requests"
import { buildStoredScheduleSlot } from "@/lib/matching/candidate-schedule"
import type { RegistrantData } from "@/lib/validations/event-registrant"
import type { Gender, MeetingFormat } from "@/app/generated/prisma/client"

/**
 * Registration core (CCF-132) — the person-resolution and per-event completion
 * steps of public registration, extracted out of `createRegistrant` so the
 * cluster shared form can resolve a person ONCE and then fan out one
 * `EventRegistrant` per selected event. `createRegistrant` composes these same
 * pieces in the same order it always ran them; single-event behavior is
 * unchanged.
 */

export type AssignedBreakout =
  | {
      id: string
      name: string
      meetingFormat: MeetingFormat | null
      locationCity: string | null
      schedule: { dayOfWeek: number; timeStart: string | null; timeEnd: string | null } | null
    }
  | null

export type PersonRef = { memberId: string } | { guestId: string; nickname?: string | null }

export type ResolvedProfile = {
  gender: Gender | null
  birthYear: number | null
}

async function fetchAssignedBreakoutDetails(groupId: string): Promise<AssignedBreakout> {
  const group = await db.breakoutGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      meetingFormat: true,
      locationCity: true,
      schedules: {
        select: { dayOfWeek: true, timeStart: true, timeEnd: true },
        orderBy: { dayOfWeek: "asc" },
        take: 1,
      },
    },
  })
  if (!group) return null
  return {
    id: group.id,
    name: group.name,
    meetingFormat: group.meetingFormat,
    locationCity: group.locationCity,
    schedule: group.schedules[0] ?? null,
  }
}

/**
 * Assign a registrant to a breakout group based on:
 *  - explicit pick (selectedBreakoutGroupId) — wins if provided & valid; capacity
 *    blocks it unless `allowOverCapacity` is set, which the caller grants only to
 *    a signed-in staff member at the door. Their picker deliberately offers full
 *    groups, so dropping the pick here would silently contradict the UI. Every
 *    anonymous submission — including one to the public walk-in route — stays
 *    capacity-gated.
 *  - else autoAssignBreakout on the event — runs the simple Gender/Age/Capacity matcher
 *  - else nothing
 * Best-effort: failures are swallowed and return null.
 *
 * Nothing is assigned unless the event has the Breakout module enabled (CCF-128).
 * The gate belongs here, at the write, not only at the surfaces that offer it:
 * `autoAssignBreakout` is a flat column that survives the module being switched
 * off, so without this an event could keep placing registrants into groups its
 * admin can no longer see.
 */
export async function assignBreakoutForRegistrant(
  registrantId: string,
  eventId: string,
  selectedBreakoutGroupId: string | null,
  profile: { gender: Gender | null; birthYear: number | null },
  allowOverCapacity = false
): Promise<AssignedBreakout> {
  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: {
        autoAssignBreakout: true,
        modules: { where: { type: "Breakout" }, select: { id: true }, take: 1 },
      },
    })
    if (!event || event.modules.length === 0) return null

    let chosenGroupId: string | null = null

    if (selectedBreakoutGroupId) {
      const picked = await db.breakoutGroup.findUnique({
        where: { id: selectedBreakoutGroupId },
        select: {
          id: true,
          eventId: true,
          memberLimit: true,
          _count: { select: { members: true } },
        },
      })
      const pickedIsFull =
        !!picked &&
        breakoutOccupancy({
          memberCount: picked._count.members,
          memberLimit: picked.memberLimit,
        }).isFull
      if (picked && picked.eventId === eventId && (allowOverCapacity || !pickedIsFull)) {
        chosenGroupId = picked.id
      }
    } else if (event.autoAssignBreakout) {
      // Auto-assign stays capacity-gated regardless: nobody chose this group, so
      // there is no intent to honour.
      const candidates = await fetchBreakoutCandidates(eventId, null, false)
      const best = suggestBreakoutGroup(candidates, profile)
      if (best) chosenGroupId = best.id
    }

    if (!chosenGroupId) return null

    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: chosenGroupId, registrantId },
    })
    await tryCreateSmallGroupRequestFromBreakout(chosenGroupId, registrantId)
    revalidatePath(`/event/${eventId}/breakouts`)
    return fetchAssignedBreakoutDetails(chosenGroupId)
  } catch {
    return null
  }
}

// Walk-in mode: check the registrant in immediately after registration.
// Sessions (MultiDay/Recurring) record an OccurrenceAttendee; OneTime events
// set attendedAt — only when null, preserving the first check-in time.
export async function checkInWalkInRegistrant(registrantId: string, occurrenceId: string | null) {
  if (occurrenceId !== null) {
    await db.occurrenceAttendee.upsert({
      where: { occurrenceId_registrantId: { occurrenceId, registrantId } },
      create: { occurrenceId, registrantId },
      update: {},
    })
  } else {
    await db.eventRegistrant.updateMany({
      where: { id: registrantId, attendedAt: null },
      data: { attendedAt: new Date() },
    })
  }
}

/** True when the member is serving as a volunteer at this event (volunteers don't register as attendees). */
export async function findEventVolunteerConflict(
  eventId: string,
  memberId: string
): Promise<boolean> {
  const volunteerRecord = await db.volunteer.findFirst({
    where: { memberId, eventId },
    select: { id: true },
  })
  return volunteerRecord !== null
}

/** Existing registration for this person at this event, if any. */
export async function findExistingEventRegistration(
  eventId: string,
  person: PersonRef
): Promise<string | null> {
  const existing = await db.eventRegistrant.findFirst({
    where:
      "memberId" in person
        ? { eventId, memberId: person.memberId }
        : { eventId, guestId: person.guestId },
    select: { id: true },
  })
  return existing?.id ?? null
}

/**
 * Record that a registration belongs to a cluster's day.
 *
 * The day roll-up counts a session event's registration only on evidence — the
 * person checked in, or they signed up through this day's link — because a
 * `EventRegistrant` on a Recurring event covers the whole series, not one date.
 * This column is that second piece of evidence, so anything that puts a person
 * through a cluster's shared form has to leave it behind, including the paths
 * that reuse a registration the person already had.
 *
 * Fills a null rather than overwriting, so the day a registration was first made
 * for stands. `EventClusterEvent.eventId` is unique — an event belongs to at
 * most one cluster — so no second day ever competes for the column; the guard is
 * about not rewriting history. Conditional update rather than read-then-write.
 */
export async function stampClusterProvenance(
  registrantId: string,
  clusterId: string
): Promise<void> {
  await db.eventRegistrant.updateMany({
    where: { id: registrantId, registrationClusterId: null },
    data: { registrationClusterId: clusterId },
  })
}

/**
 * Confirmed member: fill in only profile fields that are currently null, then
 * return the stored gender/birth year (the form's answer wins over the stored
 * one for breakout matching, combined by the caller).
 */
export async function resolveConfirmedMember(
  memberId: string,
  data: RegistrantData
): Promise<ResolvedProfile> {
  const existing = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    select: {
      nickname: true,
      email: true, phone: true, birthMonth: true, birthYear: true,
      lifeStageId: true, gender: true, language: true, meetingPreference: true, workCity: true,
      ageRangeBucketId: true,
      // A member's availability lives in a relation, not a scalar column —
      // needed to know whether the registration form's Schedule answer is
      // new information or would be overwriting what they already told us.
      schedulePreferences: { select: { id: true }, take: 1 },
    },
  })
  const memberUpdates: Record<string, unknown> = {}
  // Only the anonymous-guest branch carries a nickname onto `EventRegistrant`, so
  // without this the answer was collected and dropped for anyone who confirmed as
  // an existing member. Fill-if-empty like every other field here: a nickname
  // already on file is the one they chose, and a one-off spelling typed at
  // registration shouldn't overwrite it.
  if (!existing.nickname && data.nickname) memberUpdates.nickname = data.nickname
  if (!existing.email && data.email) memberUpdates.email = data.email
  if (!existing.phone && data.mobileNumber) memberUpdates.phone = data.mobileNumber
  if (existing.birthMonth == null && data.birthMonth != null) memberUpdates.birthMonth = data.birthMonth
  if (existing.birthYear == null && data.birthYear != null) memberUpdates.birthYear = data.birthYear
  if (!existing.lifeStageId && data.lifeStageId) memberUpdates.lifeStageId = data.lifeStageId
  if (!existing.gender && data.gender) memberUpdates.gender = data.gender
  if (!existing.language?.length && data.language?.length) memberUpdates.language = data.language
  if (!existing.meetingPreference && data.meetingPreference) memberUpdates.meetingPreference = data.meetingPreference
  if (!existing.workCity && data.workCity) memberUpdates.workCity = data.workCity
  if (!existing.ageRangeBucketId && data.ageRangeBucketId) memberUpdates.ageRangeBucketId = data.ageRangeBucketId
  // Schedule is a `SchedulePreference` relation for members (guests keep it in
  // scalar columns). Without this the form's Schedule field was collected and
  // then thrown away for anyone who confirmed as a member.
  // Times are optional — a day-only answer ("Tuesdays, any time") is still a
  // real preference, so it is normalised into a whole-day slot rather than
  // dropped.
  if (existing.schedulePreferences.length === 0 && data.scheduleDayOfWeek != null) {
    const slot = buildStoredScheduleSlot(
      data.scheduleDayOfWeek,
      data.scheduleTimeStart,
      data.scheduleTimeEnd
    )
    if (slot) {
      memberUpdates.schedulePreferences = {
        create: {
          dayOfWeek: slot.dayOfWeek,
          timeStart: slot.timeStart,
          timeEnd: slot.timeEnd,
        },
      }
    }
  }

  if (Object.keys(memberUpdates).length > 0) {
    await db.member.update({ where: { id: memberId }, data: memberUpdates })
  }
  return { gender: existing.gender, birthYear: existing.birthYear }
}

/** Confirmed guest: fill in only profile fields that are currently null; returns stored gender/birth year. */
export async function resolveConfirmedGuest(
  guestId: string,
  data: RegistrantData
): Promise<ResolvedProfile> {
  const existing = await db.guest.findUniqueOrThrow({
    where: { id: guestId },
    select: {
      nickname: true,
      email: true, phone: true, birthMonth: true, birthYear: true,
      lifeStageId: true, gender: true, language: true, meetingPreference: true, workCity: true,
      ageRangeBucketId: true,
      scheduleDayOfWeek: true, scheduleTimeStart: true, scheduleTimeEnd: true,
      claimedSmallGroupId: true, claimedSatellite: true,
    },
  })
  const guestUpdates: Record<string, unknown> = {}
  // Same fill-if-empty rule as the member path — see `resolveConfirmedMember`.
  if (!existing.nickname && data.nickname) guestUpdates.nickname = data.nickname
  if (!existing.email && data.email) guestUpdates.email = data.email
  if (!existing.phone && data.mobileNumber) guestUpdates.phone = data.mobileNumber
  if (existing.birthMonth == null && data.birthMonth != null) guestUpdates.birthMonth = data.birthMonth
  if (existing.birthYear == null && data.birthYear != null) guestUpdates.birthYear = data.birthYear
  if (!existing.lifeStageId && data.lifeStageId) guestUpdates.lifeStageId = data.lifeStageId
  if (!existing.gender && data.gender) guestUpdates.gender = data.gender
  if (!existing.language?.length && data.language?.length) guestUpdates.language = data.language
  if (!existing.meetingPreference && data.meetingPreference) guestUpdates.meetingPreference = data.meetingPreference
  if (!existing.workCity && data.workCity) guestUpdates.workCity = data.workCity
  if (!existing.ageRangeBucketId && data.ageRangeBucketId) guestUpdates.ageRangeBucketId = data.ageRangeBucketId
  if (existing.scheduleDayOfWeek == null && data.scheduleDayOfWeek != null) guestUpdates.scheduleDayOfWeek = data.scheduleDayOfWeek
  if (!existing.scheduleTimeStart && data.scheduleTimeStart) guestUpdates.scheduleTimeStart = data.scheduleTimeStart
  if (!existing.scheduleTimeEnd && data.scheduleTimeEnd) guestUpdates.scheduleTimeEnd = data.scheduleTimeEnd
  // Either side counts as "already answered" — filling one while the other is
  // set would leave the guest claiming two different DGroups.
  const claimsNoGroup = !existing.claimedSmallGroupId && !existing.claimedSatellite
  if (claimsNoGroup && data.claimedSmallGroupId) guestUpdates.claimedSmallGroupId = data.claimedSmallGroupId
  if (claimsNoGroup && data.claimedSatellite) guestUpdates.claimedSatellite = data.claimedSatellite

  if (Object.keys(guestUpdates).length > 0) {
    await db.guest.update({ where: { id: guestId }, data: guestUpdates })
  }
  return { gender: existing.gender, birthYear: existing.birthYear }
}

/**
 * Anonymous registrant: dedup against existing guests (phone → email →
 * last name + birthday), updating the matched guest's matching profile, or
 * create a fresh Guest. Skips the dedup ladder entirely when the person
 * explicitly said "That's not me" to a guest match.
 *
 * The nickname is written to the `Guest` as well as to `EventRegistrant`. It used
 * to live only on the registrant row, so a guest who gave a nickname still showed
 * a blank one in the Guests module and couldn't be found by it at their next
 * event — the per-event value is an override, not the only place it belongs.
 */
export async function resolveAnonymousGuest(
  data: RegistrantData,
  skipDeduplication?: boolean
): Promise<{ guestId: string }> {
  const matchingProfile = {
    lifeStageId: data.lifeStageId ?? null,
    gender: data.gender ?? null,
    language: data.language?.length ? data.language : undefined,
    meetingPreference: data.meetingPreference ?? null,
    workCity: data.workCity ?? null,
    ageRangeBucketId: data.ageRangeBucketId ?? null,
    scheduleDayOfWeek: data.scheduleDayOfWeek ?? null,
    scheduleTimeStart: data.scheduleTimeStart ?? null,
    scheduleTimeEnd: data.scheduleTimeEnd ?? null,
    claimedSmallGroupId: data.claimedSmallGroupId ?? null,
    claimedSatellite: data.claimedSatellite ?? null,
  }

  // Nickname rides along so the update below can fill it only when empty.
  let existingGuest: { id: string; nickname: string | null } | null = null
  if (!skipDeduplication) {
    if (data.mobileNumber) {
      existingGuest = await db.guest.findFirst({
        where: { phone: data.mobileNumber },
        select: { id: true, nickname: true },
      })
    }
    if (!existingGuest && data.email) {
      existingGuest = await db.guest.findFirst({
        where: { email: data.email },
        select: { id: true, nickname: true },
      })
    }
    if (
      !existingGuest &&
      data.lastName &&
      data.birthMonth != null &&
      data.birthYear != null
    ) {
      existingGuest = await db.guest.findFirst({
        where: {
          lastName: { equals: data.lastName.trim(), mode: "insensitive" },
          birthMonth: data.birthMonth,
          birthYear: data.birthYear,
        },
        select: { id: true, nickname: true },
      })
    }
  }

  if (existingGuest) {
    // Update matching profile with any newly provided data
    await db.guest.update({
      where: { id: existingGuest.id },
      data: {
        // Fill-if-empty rather than overwrite-if-provided like its neighbours
        // here: a nickname already on file is what this person is known as (an
        // admin may well have curated it), so a spelling typed at a registration
        // desk must not replace it. Same rule as the confirmed-member/guest
        // resolvers, which keeps one nickname rule across every write path.
        ...(!existingGuest.nickname && data.nickname && { nickname: data.nickname }),
        ...(data.birthMonth != null && { birthMonth: data.birthMonth }),
        ...(data.birthYear != null && { birthYear: data.birthYear }),
        ...(matchingProfile.lifeStageId !== null && { lifeStageId: matchingProfile.lifeStageId }),
        ...(matchingProfile.gender !== null && { gender: matchingProfile.gender }),
        ...(matchingProfile.language !== undefined && { language: matchingProfile.language }),
        ...(matchingProfile.meetingPreference !== null && { meetingPreference: matchingProfile.meetingPreference }),
        ...(matchingProfile.workCity !== null && { workCity: matchingProfile.workCity }),
        ...(matchingProfile.ageRangeBucketId !== null && { ageRangeBucketId: matchingProfile.ageRangeBucketId }),
        ...(matchingProfile.scheduleDayOfWeek !== null && {
          scheduleDayOfWeek: matchingProfile.scheduleDayOfWeek,
          scheduleTimeStart: matchingProfile.scheduleTimeStart,
          scheduleTimeEnd: matchingProfile.scheduleTimeEnd,
        }),
        ...(matchingProfile.claimedSmallGroupId !== null && {
          claimedSmallGroupId: matchingProfile.claimedSmallGroupId,
          claimedSatellite: null,
        }),
        ...(matchingProfile.claimedSatellite !== null && {
          claimedSatellite: matchingProfile.claimedSatellite,
          claimedSmallGroupId: null,
        }),
      },
    })
    return { guestId: existingGuest.id }
  }

  const newGuest = await db.guest.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      // The answer also lands on `EventRegistrant.nickname` as the per-event
      // value, which the read paths prefer. Storing it here too is what makes the
      // person findable by nickname outside this one event — in the Guests module,
      // and at check-in for every later event they attend.
      nickname: data.nickname ?? null,
      email: data.email ?? null,
      phone: data.mobileNumber,
      birthMonth: data.birthMonth ?? null,
      birthYear: data.birthYear ?? null,
      language: matchingProfile.language ?? [],
      lifeStageId: matchingProfile.lifeStageId,
      gender: matchingProfile.gender,
      meetingPreference: matchingProfile.meetingPreference,
      workCity: matchingProfile.workCity,
      ageRangeBucketId: matchingProfile.ageRangeBucketId,
      scheduleDayOfWeek: matchingProfile.scheduleDayOfWeek,
      scheduleTimeStart: matchingProfile.scheduleTimeStart,
      scheduleTimeEnd: matchingProfile.scheduleTimeEnd,
      claimedSmallGroupId: matchingProfile.claimedSmallGroupId,
      claimedSatellite: matchingProfile.claimedSatellite,
    },
    select: { id: true },
  })
  return { guestId: newGuest.id }
}

/**
 * Final per-event step: create the `EventRegistrant` row (or reuse the existing
 * one — walk-in semantics), run breakout assignment, and perform walk-in /
 * open-recurring-session check-in.
 */
export async function completeEventRegistration(opts: {
  eventId: string
  person: PersonRef
  data: RegistrantData
  /** Explicit breakout pick already resolved against the caller's form config; null = auto-assign path. */
  breakoutPick: string | null
  /** Combined form-first profile (form answer wins over the stored one) for breakout matching. */
  profile: ResolvedProfile
  /** Provenance when the registration came in through a cluster's shared form. */
  clusterId?: string | null
  walkIn?: { occurrenceId: string | null } | null
  /**
   * Whether an explicit breakout pick may exceed the group's member limit.
   *
   * Decided by the caller from the *session*, not from `walkIn`. The walk-in
   * route is public, so "this is a walk-in" is a claim the request makes about
   * itself and cannot buy a capacity override on its own.
   */
  allowOverCapacity?: boolean
  /** Existing registration to reuse instead of creating (walk-in / cluster reuse semantics). */
  existingRegistrantId?: string | null
}): Promise<{ id: string; breakoutGroup: AssignedBreakout }> {
  const { eventId, person, data, breakoutPick, profile, clusterId, walkIn, allowOverCapacity, existingRegistrantId } = opts

  let registrantId: string
  if (existingRegistrantId) {
    registrantId = existingRegistrantId
    // Provenance on the reuse path. Someone already registered who comes back
    // through the cluster's shared link still arrived through that link, and the
    // day roll-up counts people by this column — without the stamp, every
    // returning walk-in was invisible to it.
    if (clusterId) await stampClusterProvenance(registrantId, clusterId)
  } else {
    const registrant = await db.eventRegistrant.create({
      data: {
        eventId,
        ...("memberId" in person
          ? { memberId: person.memberId }
          : { guestId: person.guestId, ...(person.nickname !== undefined ? { nickname: person.nickname } : {}) }),
        dietaryPreference: data.dietaryPreference ?? null,
        dietaryOther: data.dietaryOther,
        paymentReference: data.paymentReference,
        registrationClusterId: clusterId ?? null,
      },
      select: { id: true },
    })
    registrantId = registrant.id
  }

  const breakoutGroup = await assignBreakoutForRegistrant(
    registrantId,
    eventId,
    breakoutPick,
    profile,
    !!allowOverCapacity
  )

  // Someone who asked to join a DGroup becomes a request an admin can actually
  // see (CCF-101). Raised here rather than in each caller so every entry point —
  // single event, cluster fan-out, household — gets it for free.
  if (data.wantsSmallGroup) {
    await createSeekerRequestFromRegistration(person, eventId)
  }

  // Only walk-ins mark attendance. Registering is a statement of intent, not
  // presence: a pre-registration on a Recurring event used to silently record an
  // OccurrenceAttendee whenever any session happened to be left open (`isOpen`
  // is a manual toggle that nothing auto-closes, so stale-open sessions caught
  // registrations days later). That inflated every check-in figure that reads
  // occurrence attendance — per-event dashboards and the cluster day roll-up.
  // Attendance now comes only from the check-in kiosk or an explicit walk-in.
  if (walkIn) {
    await checkInWalkInRegistrant(registrantId, walkIn.occurrenceId)
  }

  return { id: registrantId, breakoutGroup }
}
