import Link from "next/link"
import { IconCalendar, IconCheck, IconClock, IconUserCheck, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"

type SmallGroupLogEntry = {
  kind: "smallGroupLog"
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

type EventRegistrationEntry = {
  kind: "eventRegistration"
  id: string
  event: { id: string; name: string }
  createdAt: Date
}

type PromotionEntry = {
  kind: "promotion"
  memberId: string
  createdAt: Date
}

export type ActivityEntry = SmallGroupLogEntry | EventRegistrationEntry | PromotionEntry

const ACTION_LABEL: Record<SmallGroupLogEntry["action"], string> = {
  GroupCreated: "Group created",
  MemberAdded: "Added to small group",
  MemberRemoved: "Removed from small group",
  MemberTransferred: "Transferred to another group",
  TempAssignmentCreated: "Temporary assignment created",
  TempAssignmentConfirmed: "Temporary assignment confirmed",
  TempAssignmentRejected: "Temporary assignment rejected",
}

function iconForSmallGroupAction(action: SmallGroupLogEntry["action"]) {
  if (action === "TempAssignmentRejected" || action === "MemberRemoved") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-destructive/10">
        <IconX className="size-3 text-destructive" />
      </span>
    )
  }

  if (action === "MemberAdded" || action === "TempAssignmentConfirmed") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-50">
        <IconCheck className="size-3 text-emerald-700" />
      </span>
    )
  }

  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted">
      <IconClock className="size-3 text-muted-foreground" />
    </span>
  )
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function GuestActivityLog({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity yet
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        if (entry.kind === "promotion") {
          return (
            <div
              key={`promotion-${entry.memberId}`}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-green-100">
                    <IconUserCheck className="size-3 text-green-700" />
                  </span>
                  <p className="text-sm font-medium">Promoted to member</p>
                </div>
                <p className="pl-7 text-xs text-muted-foreground">
                  <Link
                    href={`/members/${entry.memberId}`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    View member profile
                  </Link>
                  {" · "}
                  {formatDate(entry.createdAt)}
                </p>
              </div>
            </div>
          )
        }

        if (entry.kind === "eventRegistration") {
          return (
            <div
              key={`reg-${entry.id}`}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-100">
                    <IconCalendar className="size-3 text-blue-700" />
                  </span>
                  <p className="text-sm font-medium">Registered for event</p>
                </div>
                <p className="pl-7 text-xs text-muted-foreground">
                  <Link
                    href={`/event/${entry.event.id}`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {entry.event.name}
                  </Link>
                  {" · "}
                  {formatDate(entry.createdAt)}
                </p>
              </div>
            </div>
          )
        }

        // SmallGroupLog entry
        return (
          <div
            key={entry.id}
            className="flex items-start justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                {iconForSmallGroupAction(entry.action)}
                <p className="text-sm font-medium">
                  {entry.description ?? ACTION_LABEL[entry.action]}
                </p>
              </div>
              <p className="pl-7 text-xs text-muted-foreground">
                <Link
                  href={`/small-groups/${entry.smallGroup.id}`}
                  className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                >
                  {entry.smallGroup.name}
                </Link>
                {" · "}
                {formatDate(entry.createdAt)}
              </p>
            </div>
            {entry.performedByUser?.name && (
              <Badge variant="outline" className="shrink-0">
                {entry.performedByUser.name}
              </Badge>
            )}
          </div>
        )
      })}
    </div>
  )
}
