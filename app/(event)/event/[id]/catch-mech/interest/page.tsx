import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { canAccessEvent, canWrite } from "@/lib/permissions"
import { PageHeader } from "@/components/page-header"
import { loadEventInterests } from "../interest-data"
import { InterestTracker } from "../interest-tracker"

export const metadata: Metadata = { title: "DGroup interest" }
export default async function InterestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!canAccessEvent(session, id)) notFound()
  const rows = await loadEventInterests(id)
  return <div className="flex flex-1 flex-col gap-6 p-6">
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href={`/event/${id}/catch-mech`} className="hover:text-foreground">Catch Mech</Link> / DGroup interest</nav>
    <PageHeader title="DGroup interest" description="Review requests and help people find a DGroup." />
    <InterestTracker eventId={id} rows={rows} canManage={canWrite(session, "SmallGroups")} />
  </div>
}
