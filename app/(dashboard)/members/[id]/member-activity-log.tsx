import Link from "next/link"
import { IconCalendar, IconCheck, IconClock, IconMessageCircle, IconUserCheck, IconX } from "@tabler/icons-react"

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

type GuestOriginEntry = {
  kind: "guestOrigin"
  guestId: string
  createdAt: Date
}

type CatchMechCommentEntry = {
  kind: "catchMechComment"
  id: string
  text: string
  createdAt: Date
  author: { name: string | null }
  event: { id: string; name: string } | null
}

export type MemberActivityEntry =
  | SmallGroupLogEntry
  | EventRegistrationEntry
  | GuestOriginEntry
  | CatchMechCommentEntry

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

export function MemberActivityLog({ entries }: { entries: MemberActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity yet
      </p>
    )
  }

  return (
    <div>
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1

        if (entry.kind === "guestOrigin") {
          return (
            <div key={`guest-origin-${entry.guestId}`} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-green-100 mt-0.5">
                  <IconUserCheck className="size-3 text-green-700" />
                </span>
                {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className={`flex-1 min-w-0 space-y-0.5 ${isLast ? "pb-0" : "pb-5"}`}>
                <p className="text-sm font-medium">Promoted from guest</p>
                <p className="text-xs text-muted-foreground">
                  <Link
                    href={`/guests/${entry.guestId}`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    View guest record
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
            <div key={`reg-${entry.id}`} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-100 mt-0.5">
                  <IconCalendar className="size-3 text-blue-700" />
                </span>
                {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className={`flex-1 min-w-0 space-y-0.5 ${isLast ? "pb-0" : "pb-5"}`}>
                <p className="text-sm font-medium">Registered for event</p>
                <p className="text-xs text-muted-foreground">
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

        if (entry.kind === "catchMechComment") {
          return (
            <div key={`cm-comment-${entry.id}`} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-100 mt-0.5">
                  <IconMessageCircle className="size-3 text-blue-700" />
                </span>
                {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className={`flex-1 min-w-0 space-y-0.5 ${isLast ? "pb-0" : "pb-5"}`}>
                <p className="text-sm">{entry.text}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.author.name ?? "Unknown"}
                  {entry.event && (
                    <>
                      {" · "}
                      <Link
                        href={`/event/${entry.event.id}/catch-mech`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {entry.event.name}
                      </Link>
                    </>
                  )}
                  {" · "}
                  {formatDate(entry.createdAt)}
                </p>
              </div>
            </div>
          )
        }

        // SmallGroupLog entry
        return (
          <div key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <span className="mt-0.5">{iconForSmallGroupAction(entry.action)}</span>
              {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <div className={`flex-1 min-w-0 space-y-0.5 ${isLast ? "pb-0" : "pb-5"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">
                  {entry.description ?? ACTION_LABEL[entry.action]}
                </p>
                {entry.performedByUser?.name && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {entry.performedByUser.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
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
          </div>
        )
      })}
    </div>
  )
}
