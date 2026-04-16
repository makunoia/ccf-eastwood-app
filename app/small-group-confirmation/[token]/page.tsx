import { IconUsers } from "@tabler/icons-react"
import { db } from "@/lib/db"
import { ConfirmationClient } from "./confirmation-client"

async function getGroupByToken(token: string) {
  return db.smallGroup.findUnique({
    where: { leaderConfirmationToken: token },
    select: {
      id: true,
      name: true,
      leader: { select: { firstName: true, lastName: true } },
      memberRequests: {
        where: { status: "Pending" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          guestId: true,
          memberId: true,
          fromGroupId: true,
          createdAt: true,
          guest: { select: { firstName: true, lastName: true } },
          member: { select: { firstName: true, lastName: true } },
          fromGroup: { select: { name: true } },
        },
      },
    },
  })
}

export default async function SmallGroupConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const group = await getGroupByToken(token)

  const pendingRequests = group?.memberRequests.map((req) => ({
    id: req.id,
    type: (req.guestId ? "guest" : "member") as "guest" | "member",
    name: req.guest
      ? `${req.guest.firstName} ${req.guest.lastName}`
      : req.member
        ? `${req.member.firstName} ${req.member.lastName}`
        : "Unknown",
    fromGroupName: req.fromGroup?.name ?? null,
    createdAt: req.createdAt,
  })) ?? []

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <IconUsers className="size-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold">Member Confirmation</h1>
          {group && (
            <p className="text-sm text-muted-foreground">
              For{" "}
              <span className="font-medium text-foreground">{group.name}</span>
              {" "}— led by{" "}
              <span className="font-medium text-foreground">
                {group.leader.firstName} {group.leader.lastName}
              </span>
            </p>
          )}
        </div>

        {!group ? (
          <div className="text-center space-y-2">
            <p className="font-medium">Link not found</p>
            <p className="text-sm text-muted-foreground">
              This confirmation link is invalid or has expired. Please contact
              the church office.
            </p>
          </div>
        ) : (
          <ConfirmationClient
            token={token}
            groupName={group.name}
            pendingRequests={pendingRequests}
          />
        )}
      </div>
    </div>
  )
}
