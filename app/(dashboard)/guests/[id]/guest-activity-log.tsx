import Link from "next/link"
import { IconCheck, IconClock, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"

type GuestLog = {
  id: string
  action:
    | "GroupCreated"
    | "MemberAdded"
    | "MemberRemoved"
    | "MemberTransferred"
    | "TempAssignmentCreated"
    | "TempAssignmentConfirmed"
    | "TempAssignmentRejected"
  description: string | null
  createdAt: Date
  smallGroup: {
    id: string
    name: string
  }
  performedByUser: {
    name: string | null
  } | null
}

const ACTION_LABEL: Record<GuestLog["action"], string> = {
  GroupCreated: "Group created",
  MemberAdded: "Member added",
  MemberRemoved: "Member removed",
  MemberTransferred: "Member transferred",
  TempAssignmentCreated: "Temporary assignment created",
  TempAssignmentConfirmed: "Temporary assignment confirmed",
  TempAssignmentRejected: "Temporary assignment rejected",
}

function iconForAction(action: GuestLog["action"]) {
  if (action === "TempAssignmentRejected" || action === "MemberRemoved") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-red-100">
        <IconX className="size-3 text-red-700" />
      </span>
    )
  }

  if (action === "MemberAdded" || action === "TempAssignmentConfirmed") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-green-100">
        <IconCheck className="size-3 text-green-700" />
      </span>
    )
  }

  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-100">
      <IconClock className="size-3 text-blue-700" />
    </span>
  )
}

export function GuestActivityLog({ logs }: { logs: GuestLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity yet
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-start justify-between gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              {iconForAction(log.action)}
              <p className="text-sm font-medium">
                {log.description ?? ACTION_LABEL[log.action]}
              </p>
            </div>
            <p className="pl-7 text-xs text-muted-foreground">
              <Link
                href={`/small-groups/${log.smallGroup.id}`}
                className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
              >
                {log.smallGroup.name}
              </Link>
              {" · "}
              {log.createdAt.toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </p>
          </div>
          {log.performedByUser?.name && (
            <Badge variant="outline" className="shrink-0">
              {log.performedByUser.name}
            </Badge>
          )}
        </div>
      ))}
    </div>
  )
}
