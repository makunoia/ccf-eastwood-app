"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { IconCheck, IconClock, IconMessageCircle, IconX } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { addCatchMechComment } from "../../matching-actions"

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
  smallGroup: { id: string; name: string }
  performedByUser: { name: string | null } | null
}

type CommentEntry = {
  kind: "comment"
  id: string
  text: string
  createdAt: Date
  author: { name: string | null }
}

export type CatchMechActivityEntry = SmallGroupLogEntry | CommentEntry

const ACTION_LABEL: Record<SmallGroupLogEntry["action"], string> = {
  GroupCreated: "Group created",
  MemberAdded: "Added to small group",
  MemberRemoved: "Removed from small group",
  MemberTransferred: "Transferred to another group",
  TempAssignmentCreated: "Temporary assignment created",
  TempAssignmentConfirmed: "Temporary assignment confirmed",
  TempAssignmentRejected: "Temporary assignment rejected",
}

function iconForAction(action: SmallGroupLogEntry["action"]) {
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

type Props = {
  entries: CatchMechActivityEntry[]
  requestId: string | null
}

export function CatchMechActivityLog({ entries, requestId }: Props) {
  const router = useRouter()
  const [text, setText] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit() {
    if (!requestId || !text.trim()) return
    setSubmitting(true)
    const res = await addCatchMechComment(requestId, text)
    setSubmitting(false)
    if (res.success) {
      setText("")
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No activity yet</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            if (entry.kind === "comment") {
              return (
                <div
                  key={`comment-${entry.id}`}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-100">
                        <IconMessageCircle className="size-3 text-blue-700" />
                      </span>
                      <p className="text-sm">{entry.text}</p>
                    </div>
                    <p className="pl-7 text-xs text-muted-foreground">
                      {entry.author.name ?? "Unknown"} · {formatDate(entry.createdAt)}
                    </p>
                  </div>
                </div>
              )
            }

            // SmallGroupLog entry
            return (
              <div
                key={`log-${entry.id}`}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {iconForAction(entry.action)}
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
      )}

      {requestId && (
        <div className="space-y-2 pt-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Leave a comment…"
            rows={3}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => { void handleSubmit() }}
            disabled={submitting || !text.trim()}
          >
            {submitting ? "Saving…" : "Add comment"}
          </Button>
        </div>
      )}
    </div>
  )
}
