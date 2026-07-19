import { db } from "@/lib/db"

/**
 * Event setup walkthrough — derives the recommended setup checklist shown on the
 * event dashboard. Each step is "done" when the event has at least one matching
 * record. The step list adapts to event type: OneTime events omit the "Create
 * Session" step (they record attendance on `EventRegistrant.attendedAt` and have
 * no occurrences), while MultiDay/Recurring show all six steps.
 */

export type SetupStepKey =
  | "committees"
  | "volunteers"
  | "breakouts"
  | "sessions"
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
): Promise<EventSetupChecklist> {
  const base = `/event/${eventId}`
  const isOneTime = eventType === "OneTime"

  const [
    committeeCount,
    volunteerCount,
    breakoutCount,
    sessionCount,
    registrantCount,
    checkinCount,
  ] = await Promise.all([
    db.volunteerCommittee.count({ where: { eventId } }),
    db.volunteer.count({ where: { eventId } }),
    db.breakoutGroup.count({ where: { eventId } }),
    // Sessions are irrelevant for OneTime — skip the query entirely.
    isOneTime
      ? Promise.resolve(0)
      : db.eventOccurrence.count({ where: { eventId } }),
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

  const steps: SetupStep[] = [
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
    {
      key: "breakouts",
      label: "Add breakout groups",
      description: "Set up breakout groups and assign facilitators.",
      done: breakoutCount > 0,
      href: `${base}/breakouts`,
    },
  ]

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
