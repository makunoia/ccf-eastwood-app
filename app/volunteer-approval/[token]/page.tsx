import { IconShield } from "@tabler/icons-react"
import { db } from "@/lib/db"
import { ApprovalClient } from "./approval-client"

async function getVolunteer(token: string) {
  return db.volunteer.findUnique({
    where: { leaderApprovalToken: token },
    select: {
      id: true,
      status: true,
      notes: true,
      member: { select: { firstName: true, lastName: true } },
      event: { select: { name: true } },
      committee: { select: { name: true } },
      preferredRole: { select: { name: true } },
    },
  })
}

export default async function LeaderApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const volunteer = await getVolunteer(token)

  const scope = volunteer?.event?.name ?? "—"

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <IconShield className="size-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold">Leader Approval</h1>
          <p className="text-sm text-muted-foreground">
            A member in your small group has applied to volunteer.
          </p>
        </div>

        {!volunteer ? (
          <div className="text-center space-y-2">
            <p className="font-medium">Link not found</p>
            <p className="text-sm text-muted-foreground">
              This approval link is invalid or has expired. Please contact the church office.
            </p>
          </div>
        ) : (
          <ApprovalClient
            token={token}
            volunteerName={`${volunteer.member.firstName} ${volunteer.member.lastName}`}
            scope={scope}
            committee={volunteer.committee.name}
            preferredRole={volunteer.preferredRole.name}
            notes={volunteer.notes}
            alreadyResolved={volunteer.status !== "Pending"}
            resolvedStatus={volunteer.status}
          />
        )}
      </div>
    </div>
  )
}
