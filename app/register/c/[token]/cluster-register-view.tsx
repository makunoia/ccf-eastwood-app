import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { clusterEventMinistry } from "@/lib/clusters/ministry-label"
import { RegistrationForm } from "@/app/events/[id]/register/registration-form"
import { PublicFormShell } from "@/components/public-form-shell"
import { FormClosed } from "@/components/form-closed"
import {
  getClusterFormConfig,
  getClusterFormSuccessMessage,
} from "@/lib/forms/context-config-server"
import { isWithinRegistrationWindow } from "@/lib/events/registration-window"
import { clusterWalkInBackPath } from "@/lib/public-routes"
import { clusterOffersBreakoutStep } from "@/lib/forms/cluster-sections"
import { fetchClusterBreakoutAvailability } from "@/lib/breakout-suggestion-server"
import { resolveBreakoutNotice, withoutOccupancy } from "@/lib/breakout-suggestion"
import { isEventStaffViewer } from "@/lib/events/staff-viewer"
import type { FormTheme } from "@/lib/forms/config"

/**
 * The cluster shared registration form (CCF-132), rendered by both public routes:
 * `/register/c/[token]` and its door counterpart `/register/c/[token]/walk-in`
 * (CCF-133). One implementation, two entry points — the walk-in route used to be
 * the same URL plus `?checkin=1`, and splitting it must not fork the form itself.
 *
 * Door mode differs only in what gates it and what happens on submit: it skips the
 * open/close toggle and the registration window, and it checks the person in.
 */

export async function getCluster(token: string) {
  return db.eventCluster.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      name: true,
      kind: true,
      date: true,
      isOpen: true,
      walkInIsOpen: true,
      checkInIsOpen: true,
      registrationStart: true,
      registrationEnd: true,
      logoUrl: true,
      themeColorPrimary: true,
      registrationPageTitle: true,
      registrationPageDescription: true,
      registrationPageBannerUrl: true,
      events: {
        orderBy: { order: "asc" },
        select: {
          // Which session of this member event the day stands for. The door's
          // facilitator gate is keyed to it — see `facilitatorGateForOccurrences`.
          occurrenceId: true,
          event: {
            select: {
              id: true,
              name: true,
              type: true,
              startDate: true,
              endDate: true,
              // The collab form's one question is "which ministry are you part of?",
              // so the label on each choice is the ministry's name. `allMinistries`
              // means "every ministry", which is no answer at all — treated the same
              // as none, and the form falls back to the event name.
              allMinistries: true,
              ministries: {
                select: { ministry: { select: { id: true, name: true, logoUrl: true } } },
              },
            },
          },
        },
      },
    },
  })
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function eventMeta(event: {
  type: "OneTime" | "MultiDay" | "Recurring"
  startDate: Date
  endDate: Date
}): string {
  if (event.type === "Recurring") return "Recurring"
  if (event.type === "MultiDay" && event.endDate.getTime() !== event.startDate.getTime()) {
    return `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`
  }
  return formatDate(event.startDate)
}

export async function ClusterRegisterView({
  token,
  mobile,
  door,
}: {
  token: string
  mobile?: string
  /** Door mode: skip the open/close rules and check the person in on submit. */
  door: boolean
}) {
  const cluster = await getCluster(token)
  if (!cluster) notFound()

  const walkIn = door
    ? {
        occurrenceId: null,
        prefill: mobile ? { mobileNumber: mobile } : {},
        backHref: clusterWalkInBackPath(token, cluster.checkInIsOpen),
      }
    : undefined

  // Two switches, deliberately independent (CCF-133). The shared form answers to
  // `isOpen` plus the registration window; the door answers only to its own
  // switch, so closing pre-registration the night before leaves it running.
  if (door) {
    if (!cluster.walkInIsOpen) {
      return <FormClosed title="Walk-in is currently unavailable" />
    }
  } else {
    const open =
      cluster.isOpen &&
      isWithinRegistrationWindow(cluster.registrationStart, cluster.registrationEnd)
    if (!open) return <FormClosed />
  }

  const formContext = door ? "WalkIn" : "Register"
  const [formFields, successMessage] = await Promise.all([
    getClusterFormConfig(cluster.id, formContext),
    getClusterFormSuccessMessage(cluster.id, formContext),
  ])
  // Payment is out of scope for the shared form and household capture doesn't fan
  // out. Breakout picking follows where cluster-owned tables exist — a Collab day
  // owns its own, a Parallel day's events each run their own standing set and a
  // registrant may tick several, so there is no one set to offer. Per-event
  // auto-assign still runs on submit either way.
  const offersBreakout = clusterOffersBreakoutStep(cluster.kind)
  const config = {
    ...formFields,
    sectionPayment: false,
    sectionBreakout: offersBreakout && formFields.sectionBreakout,
    sectionFamily: false,
  }

  // The door is the stricter surface, exactly as it is on a single event: it
  // offers only tables whose facilitator is in the room, and it keeps the
  // headcounts for a signed-in staff member. The shared form offers every enabled
  // table and never ships an occupancy figure to a registrant's browser.
  const { candidates: rawBreakoutCandidates, totalGroups: breakoutTotalGroups } =
    !config.sectionBreakout
      ? { candidates: [], totalGroups: 0 }
      : await fetchClusterBreakoutAvailability(cluster.id, {
          occurrenceIds: door ? cluster.events.map((ce) => ce.occurrenceId) : [],
          requireCheckedIn: door,
        })

  const breakoutCandidates =
    door && (await isEventStaffViewer())
      ? rawBreakoutCandidates
      : withoutOccupancy(rawBreakoutCandidates)

  // An empty list is worth explaining when tables exist and the gate is holding
  // all of them back — otherwise the step would just vanish at the door.
  const breakoutNotice = resolveBreakoutNotice({
    offerPicker: config.sectionBreakout,
    candidateCount: breakoutCandidates.length,
    totalGroups: breakoutTotalGroups,
  })

  const lifeStages = config.fieldLifeStage
    ? await db.lifeStage.findMany({
        orderBy: { order: "asc" },
        select: { id: true, name: true },
      })
    : []

  const ageRanges = config.fieldAgeRange
    ? await db.ageRangeBucket.findMany({
        orderBy: { order: "asc" },
        select: { id: true, label: true },
      })
    : []

  const theme: FormTheme = {
    title: door
      ? `${cluster.name} Walk-in`
      : cluster.registrationPageTitle || `${cluster.name} Registration`,
    description:
      cluster.registrationPageDescription ||
      (cluster.date ? formatDate(cluster.date) : null),
    logoUrl: cluster.logoUrl,
    bannerUrl: cluster.registrationPageBannerUrl,
    primaryColor: cluster.themeColorPrimary,
  }

  return (
    <PublicFormShell theme={theme} alt={cluster.name}>
      <RegistrationForm
        cluster={{
          token,
          kind: cluster.kind,
          name: cluster.name,
          events: cluster.events.map((ce) => ({
            id: ce.event.id,
            name: ce.event.name,
            meta: eventMeta(ce.event),
            ministry: clusterEventMinistry(ce.event),
          })),
        }}
        eventName={cluster.name}
        config={config}
        successMessage={successMessage}
        lifeStages={lifeStages}
        ageRanges={ageRanges}
        breakoutCandidates={breakoutCandidates}
        breakoutNotice={breakoutNotice}
        walkIn={walkIn}
      />
    </PublicFormShell>
  )
}
