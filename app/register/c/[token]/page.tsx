import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ClusterRegisterView } from "./cluster-register-view"

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
    title: { absolute: cluster ? `Register · ${cluster.name}` : "Register" },
  }
}

export default async function ClusterRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ checkin?: string; mobile?: string }>
}) {
  const { token } = await params
  const { checkin, mobile } = await searchParams

  // Door mode moved to its own route (CCF-133). The old `?checkin=1` link is on
  // kiosk bookmarks, so it redirects rather than silently rendering the public
  // form — which would take a registration without checking anyone in.
  if (checkin) {
    const query = mobile ? `?mobile=${encodeURIComponent(mobile)}` : ""
    redirect(`/register/c/${token}/walk-in${query}`)
  }

  return <ClusterRegisterView token={token} mobile={mobile} door={false} />
}
