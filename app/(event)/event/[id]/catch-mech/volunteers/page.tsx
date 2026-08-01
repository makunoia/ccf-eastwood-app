import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { canRead } from "@/lib/permissions"
import { getVolunteerFollowUpData } from "./data"
import { VolunteerFollowUpClient } from "./volunteer-follow-up-client"

export default async function CatchMechVolunteerFollowUpPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getVolunteerFollowUpData(id)
  if (!data) notFound()

  const session = await auth()

  return (
    <div className="flex flex-1 flex-col p-6">
      <VolunteerFollowUpClient
        eventId={id}
        canViewMember={canRead(session, "Members")}
        canViewSmallGroup={canRead(session, "SmallGroups")}
        {...data}
      />
    </div>
  )
}
