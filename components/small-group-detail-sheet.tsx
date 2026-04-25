"use client"

import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { getSmallGroupDetails } from "@/app/(dashboard)/guests/matching-actions"

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const period = h < 12 ? "AM" : "PM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SmallGroupDetails = {
  id: string
  name: string
  leader: { firstName: string; lastName: string } | null
  lifeStage: { name: string } | null
  genderFocus: "Male" | "Female" | "Mixed" | null
  language: string[]
  locationCity: string | null
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  memberLimit: number | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  members: {
    id: string
    firstName: string
    lastName: string
    groupStatus: "Member" | "Timothy" | "Leader" | null
  }[]
  currentCount: number
}

// ─── SmallGroupDetailSheet ────────────────────────────────────────────────────

export function SmallGroupDetailSheet({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [data, setData] = React.useState<SmallGroupDetails | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open || !groupId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null)
    setLoading(true)
    getSmallGroupDetails(groupId).then((res) => {
      setLoading(false)
      if (res.success) setData(res.data)
      else toast.error(res.error)
    })
  }, [open, groupId])

  const meetingFormatLabel: Record<string, string> = {
    Online: "Online",
    Hybrid: "Hybrid",
    InPerson: "In Person",
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {loading || !data ? (
          <SheetHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32 mt-1" />
          </SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{data.name}</SheetTitle>
              <SheetDescription>
                {data.leader
                  ? `Led by ${data.leader.firstName} ${data.leader.lastName}`
                  : "No leader assigned"}
              </SheetDescription>
            </SheetHeader>

            <div className="px-4 space-y-6">
              {/* Basic Info */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Details
                </h3>
                <div className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Life Stage</span>
                  <span>{data.lifeStage?.name ?? "—"}</span>
                  <span className="text-muted-foreground">Gender Focus</span>
                  <span>{data.genderFocus ?? "—"}</span>
                  <span className="text-muted-foreground">Language</span>
                  <span>{data.language.length > 0 ? data.language.join(", ") : "—"}</span>
                  <span className="text-muted-foreground">Location</span>
                  <span>{data.locationCity ?? "—"}</span>
                  <span className="text-muted-foreground">Format</span>
                  <span>
                    {data.meetingFormat ? (meetingFormatLabel[data.meetingFormat] ?? data.meetingFormat) : "—"}
                  </span>
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Schedule
                </h3>
                {data.scheduleDayOfWeek != null && data.scheduleTimeStart ? (
                  <p className="text-sm">
                    {DAY_NAMES[data.scheduleDayOfWeek]} · {formatTime(data.scheduleTimeStart)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No schedule set</p>
                )}
              </div>

              {/* Capacity */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Capacity
                </h3>
                <p className="text-sm">
                  {data.currentCount} / {data.memberLimit != null ? data.memberLimit : "No limit"}{" "}
                  members
                </p>
              </div>

              {/* Members */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Members
                </h3>
                {data.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members yet</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between text-sm">
                        <span>{m.firstName} {m.lastName}</span>
                        {m.groupStatus && (
                          <Badge variant="secondary" className="text-xs">
                            {m.groupStatus}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
