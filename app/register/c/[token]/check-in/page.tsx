import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { PublicFormShell } from "@/components/public-form-shell"
import { FormClosed } from "@/components/form-closed"
import { clusterWalkInPath } from "@/lib/public-routes"
import { clusterOffersBreakoutStep } from "@/lib/forms/cluster-sections"
import { getClusterFormConfig } from "@/lib/forms/context-config-server"
import type { FormTheme } from "@/lib/forms/config"
import { formatDate } from "../cluster-register-view"
import { ClusterCheckinBoard } from "./cluster-checkin-board"

/**
 * The cluster day's check-in kiosk — the third and last of a cluster's public
 * surfaces, alongside the shared registration form and the walk-in door.
 *
 * Its own switch (`checkInIsOpen`), for the same reason the door has one: the
 * three open and close on different schedules. Registration typically closes the
 * night before, while the kiosk and the door run through the morning.
 *
 * No session picker and no event picker. `EventClusterEvent` already records
 * which session of a recurring event each cluster day stands for, and the point
 * of this screen is that the person doesn't have to choose.
 *
 * On a Collab day the screen goes further and says nothing about events at all —
 * see `ClusterCheckinBoard`.
 */

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
    title: { absolute: cluster ? `Check-in · ${cluster.name}` : "Check-in" },
  }
}

export default async function ClusterCheckinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      name: true,
      date: true,
      kind: true,
      checkInIsOpen: true,
      walkInIsOpen: true,
      logoUrl: true,
      themeColorPrimary: true,
      registrationPageBannerUrl: true,
    },
  })
  if (!cluster) notFound()

  if (!cluster.checkInIsOpen) {
    return <FormClosed title="Check-in is currently unavailable" />
  }

  // Collab only: a Parallel day owns no tables of its own, which is the same rule
  // `clusterOffersBreakoutStep` draws for the shared registration form.
  const offerBreakout =
    clusterOffersBreakoutStep(cluster.kind) &&
    (await getClusterFormConfig(cluster.id, "CheckIn")).sectionBreakout

  const theme: FormTheme = {
    title: `${cluster.name} Check-in`,
    description: cluster.date ? formatDate(cluster.date) : null,
    logoUrl: cluster.logoUrl,
    bannerUrl: cluster.registrationPageBannerUrl,
    primaryColor: cluster.themeColorPrimary,
  }

  return (
    <PublicFormShell theme={theme} alt={cluster.name}>
      {/* The board renders chrome-less, exactly like the per-event `CheckinBoard`,
          so the card body is the page's to supply — the same one the per-event
          check-in page wraps it in. `PublicFormShell` only gives the column. */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <ClusterCheckinBoard
          token={token}
          kind={cluster.kind}
          // Only offered while the door is actually open, so someone who can't
          // find themselves is never sent to a page that just tells them no.
          walkInHref={cluster.walkInIsOpen ? clusterWalkInPath(token) : null}
          offerBreakout={offerBreakout}
        />
      </div>
    </PublicFormShell>
  )
}
