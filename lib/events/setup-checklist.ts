import { db } from "@/lib/db"
import type { EventModuleType } from "@/app/generated/prisma/client"

/**
 * Event setup walkthrough — derives the recommended setup checklist shown on the
 * event dashboard. Each step is "done" when the event has at least one matching
 * record.
 *
 * The list adapts to what the event actually uses, so it never advertises work the
 * admin has no screen for. OneTime events omit "Create Session" (they record
 * attendance on `EventRegistrant.attendedAt` and have no occurrences), and the
 * volunteer and breakout steps appear only with their modules enabled. There is no
 * "choose your modules" step: that decision is made on the create-event form
 * (CCF-131), so by the time this checklist renders it has already been answered.
 */

export type SetupStepKey =
  | "committees"
  | "volunteers"
  | "breakouts"
  | "sessions"
  | "form"
  | "register"
  | "checkin"

export type SetupStep = {
  key: SetupStepKey
  label: string
  description: string
  done: boolean
  /** In-app deep-link to where the step is performed. */
  href: string
  /** CTA hint for the client — Register copies the public link; others are plain deep-links. */
  action?: "copyRegisterLink"
}

export type EventSetupChecklist = {
  steps: SetupStep[]
  completedCount: number
  totalCount: number
  allComplete: boolean
}

type EventType = "OneTime" | "MultiDay" | "Recurring"

export async function getEventSetupChecklist(
  eventId: string,
  eventType: EventType,
  modules: EventModuleType[] = [],
): Promise<EventSetupChecklist> {
  const base = `/event/${eventId}`
  const isOneTime = eventType === "OneTime"
  const hasVolunteers = modules.includes("Volunteers")
  const hasBreakouts = modules.includes("Breakout")

  const [
    committeeCount,
    volunteerCount,
    breakoutCount,
    sessionCount,
    configuredFormCount,
    registrantCount,
    checkinCount,
  ] = await Promise.all([
    // Skip the queries for modules this event doesn't use — their steps are hidden.
    hasVolunteers
      ? db.volunteerCommittee.count({ where: { eventId } })
      : Promise.resolve(0),
    hasVolunteers ? db.volunteer.count({ where: { eventId } }) : Promise.resolve(0),
    hasBreakouts ? db.breakoutGroup.count({ where: { eventId } }) : Promise.resolve(0),
    // Sessions are irrelevant for OneTime — skip the query entirely.
    isOneTime
      ? Promise.resolve(0)
      : db.eventOccurrence.count({ where: { eventId } }),
    // "Has the admin been through the form builder?" — answered by a stamp only
    // the save paths write, never a migration.
    //
    // Row existence used to answer it, until the nickname migration wrote a row
    // for every event that had none. Reading the toggles answered it next, and
    // was wrong in the other direction: switching the last toggle off un-ticked
    // the step, when an admin who has been through the builder and chosen to ask
    // for nothing extra has still configured the form. Once done, done.
    db.eventFormConfig.count({ where: { eventId, configuredAt: { not: null } } }),
    db.eventRegistrant.count({ where: { eventId } }),
    // OneTime attendance lives on EventRegistrant.attendedAt; MultiDay/Recurring
    // use OccurrenceAttendee (participant rows only — volunteer check-ins have a
    // null registrantId and must not count).
    isOneTime
      ? db.eventRegistrant.count({ where: { eventId, attendedAt: { not: null } } })
      : db.occurrenceAttendee.count({
          where: { registrantId: { not: null }, occurrence: { eventId } },
        }),
  ])

  const steps: SetupStep[] = []

  if (hasVolunteers) {
    steps.push(
      {
        key: "committees",
        label: "Set up committees",
        description: "Create the volunteer committees and roles for this event.",
        done: committeeCount > 0,
        href: `${base}/settings?tab=committees`,
      },
      {
        key: "volunteers",
        label: "Add volunteers",
        description: "Add the people serving and assign them to committees.",
        done: volunteerCount > 0,
        href: `${base}/volunteers`,
      },
    )
  }

  if (hasBreakouts) {
    steps.push({
      key: "breakouts",
      label: "Add breakout groups",
      description: "Set up breakout groups and assign facilitators.",
      done: breakoutCount > 0,
      href: `${base}/breakouts`,
    })
  }

  if (!isOneTime) {
    steps.push({
      key: "sessions",
      label: "Create a session",
      description: "Schedule the sessions where attendance will be tracked.",
      done: sessionCount > 0,
      href: `${base}/sessions`,
    })
  }

  steps.push(
    {
      key: "form",
      label: "Set up the registration form",
      description:
        "Choose what Register, Walk-in, and Check-in each ask for. New events start with just name and contact details.",
      done: configuredFormCount > 0,
      href: `${base}/forms/EventRegistration`,
    },
    {
      key: "register",
      label: "Open registration",
      description: "Share the registration link so people can sign up.",
      done: registrantCount > 0,
      href: `/events/${eventId}/register`,
      action: "copyRegisterLink",
    },
    {
      key: "checkin",
      label: "Run check-in",
      description: "Check attendees in when the event begins.",
      done: checkinCount > 0,
      href: isOneTime ? `${base}/checkin` : `${base}/sessions`,
    },
  )

  const completedCount = steps.filter((s) => s.done).length

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    allComplete: completedCount === steps.length,
  }
}
