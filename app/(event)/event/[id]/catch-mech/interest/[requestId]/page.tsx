import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { UserRound } from "lucide-react"
import { canAccessEvent, canRead, canWrite } from "@/lib/permissions"
import { PageHeader, PageActions } from "@/components/page-header"
import { loadEventInterests } from "../../interest-data"
import { InterestPlacement } from "./placement-client"

export const metadata: Metadata = { title: "Find a DGroup" }
export default async function InterestPlacementPage({ params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params
  const session = await auth()
  if (!canAccessEvent(session, id)) notFound()
  const request = (await loadEventInterests(id, requestId))[0]
  if (!request) notFound()
  const canViewProfile = canRead(session, request.personType === "Member" ? "Members" : "Guests")
  return <div className="flex flex-1 flex-col gap-6 p-6">
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1 text-sm text-muted-foreground"><Link href={`/event/${id}/catch-mech`} className="hover:text-foreground">Catch Mech</Link> / <Link href={`/event/${id}/catch-mech/interest`} className="hover:text-foreground">DGroup interest</Link> / {request.personName}</nav>
    <PageHeader
      title={request.personName}
      description={`${request.personType} · Requested ${new Date(request.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}`}
      actions={canViewProfile ? <PageActions actions={[{
        label: "View profile",
        icon: <UserRound className="size-4" />,
        href: `/${request.personType === "Member" ? "members" : "guests"}/${request.personId}`,
      }]} /> : undefined}
    />
    <InterestPlacement eventId={id} request={request} canManage={canWrite(session, "SmallGroups")} />
  </div>
}
