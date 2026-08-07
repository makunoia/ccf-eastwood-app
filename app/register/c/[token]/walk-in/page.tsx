import type { Metadata } from "next"
import { db } from "@/lib/db"
import { ClusterRegisterView } from "../cluster-register-view"

/**
 * The cluster day's door form (CCF-133). Same shared form as
 * `/register/c/[token]`, in door mode: it ignores the cluster's open/close toggle
 * and registration window, reuses an existing registration instead of erroring,
 * and checks the person in on submit.
 *
 * No session picker here, unlike single events — `EventClusterEvent` already
 * records which session of a recurring event each cluster day stands for, so the
 * target is already known.
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
    title: { absolute: cluster ? `Walk-in · ${cluster.name}` : "Walk-in" },
  }
}

export default async function ClusterWalkInPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ mobile?: string }>
}) {
  const { token } = await params
  const { mobile } = await searchParams
  return <ClusterRegisterView token={token} mobile={mobile} door />
}
