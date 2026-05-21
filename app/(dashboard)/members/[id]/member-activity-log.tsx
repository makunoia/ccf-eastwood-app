import Link from "next/link"
import { IconCalendar, IconCheck, IconClock, IconMessageCircle, IconPencil, IconUserCheck, IconX } from "@tabler/icons-react"
import { TimelineEntry } from "@/components/ui/timeline-entry"

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

type VolunteerInfoUpdateEntry = {
  kind: "volunteerInfoUpdate"
  id: string
  description: string | null
  event: { id: string; name: string } | null
  createdAt: Date
}

export type MemberActivityEntry =
  | SmallGroupLogEntry
  | EventRegistrationEntry
  | GuestOriginEntry
  | CatchMechCommentEntry
  | VolunteerInfoUpdateEntry

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
            <TimelineEntry
              key={`guest-origin-${entry.guestId}`}
              icon={
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-green-100">
                  <IconUserCheck className="size-3 text-green-700" />
                </span>
              }
              isLast={isLast}
            >
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
            </TimelineEntry>
          )
        }

        if (entry.kind === "eventRegistration") {
          return (
            <TimelineEntry
              key={`reg-${entry.id}`}
              icon={
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-100">
                  <IconCalendar className="size-3 text-blue-700" />
                </span>
              }
              isLast={isLast}
            >
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
            </TimelineEntry>
          )
        }

        if (entry.kind === "catchMechComment") {
          return (
            <TimelineEntry
              key={`cm-comment-${entry.id}`}
              icon={
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-100">
                  <IconMessageCircle className="size-3 text-blue-700" />
                </span>
              }
              isLast={isLast}
            >
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
            </TimelineEntry>
          )
        }

        if (entry.kind === "volunteerInfoUpdate") {
          return (
            <TimelineEntry
              key={`vol-info-${entry.id}`}
              icon={
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-violet-100">
                  <IconPencil className="size-3 text-violet-700" />
                </span>
              }
              isLast={isLast}
            >
              <p className="text-sm font-medium">Updated volunteer information</p>
              <p className="text-xs text-muted-foreground">
                {entry.event && (
                  <>
                    <Link
                      href={`/event/${entry.event.id}`}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {entry.event.name}
                    </Link>
                    {" · "}
                  </>
                )}
                {formatDate(entry.createdAt)}
              </p>
              {entry.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
              )}
            </TimelineEntry>
          )
        }

        // SmallGroupLog entry
        return (
          <TimelineEntry
            key={entry.id}
            icon={iconForSmallGroupAction(entry.action)}
            isLast={isLast}
          >
            {entry.performedByUser?.name && (
              <p className="text-xs text-muted-foreground">Action by {entry.performedByUser.name}</p>
            )}
            <p className="text-sm font-medium">
              {entry.description ?? ACTION_LABEL[entry.action]}
            </p>
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
          </TimelineEntry>
        )
      })}
    </div>
  )
}
