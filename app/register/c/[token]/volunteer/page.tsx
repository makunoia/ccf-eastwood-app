import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { ClusterKind } from "@/app/generated/prisma/client"
import { FormClosed } from "@/components/form-closed"
import { VolunteerSignUpForm } from "@/app/volunteers/volunteer-sign-up-form"
import { formatDate } from "../cluster-register-view"

/**
 * The event day's shared volunteer form.
 *
 * The staffing counterpart of `/register/c/[token]`, and it exists for the same
 * reason that form does: on a Collab day the two ministries run one session, and
 * a person serving at it should sign up once, for the day. Filing that sign-up
 * still needs an event — a volunteer serves under a ministry — so the form asks
 * which ministry they are part of and files it against that ministry's event,
 * stamped with the day. That stamp is what lets the cluster workspace show the
 * day's serving team instead of the union of both standing rosters.
 *
 * Collab-only, matching the cluster workspace's Volunteers screen: a Parallel
 * day's events each recruit their own team through their own form.
 */

async function getCluster(token: string) {
  return db.eventCluster.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      name: true,
      kind: true,
      date: true,
      volunteerIsOpen: true,
      events: {
        orderBy: { order: "asc" },
        select: {
          event: {
            select: {
              id: true,
              name: true,
              allMinistries: true,
              ministries: { select: { ministry: { select: { name: true } } } },
              committees: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  name: true,
                  roles: {
                    orderBy: { createdAt: "asc" },
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { publicToken: token },
    select: { name: true },
  })
  return {
    title: {
      absolute: cluster ? `Volunteer Sign-Up · ${cluster.name}` : "Volunteer Sign-Up",
    },
  }
}

export default async function ClusterVolunteerSignUpPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const cluster = await getCluster(token)
  if (!cluster || cluster.kind !== ClusterKind.Collab) notFound()
  if (!cluster.volunteerIsOpen) return <FormClosed />

  // Same fallback as the registration form: a day that slipped through the
  // collab ministry check still has to be fillable, so an event with no single
  // ministry is labelled by its own name rather than dead-ending the volunteer.
  const ministries = cluster.events.map((ce) => ({
    eventId: ce.event.id,
    label:
      !ce.event.allMinistries && ce.event.ministries.length === 1
        ? ce.event.ministries[0].ministry.name
        : ce.event.name,
    committees: ce.event.committees,
  }))

  // Rendered bare, like the per-event volunteer form it mirrors: that form owns
  // its own centred layout and heading, so wrapping it in the branded public
  // shell would stack two headers on one page.
  const contextName = cluster.date
    ? `${cluster.name} · ${formatDate(cluster.date)}`
    : cluster.name

  return <VolunteerSignUpForm contextName={contextName} day={{ token, ministries }} />
}
