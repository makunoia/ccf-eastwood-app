"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { formatSchedule } from "@/lib/format/schedule"

// ─── Normalized shape ─────────────────────────────────────────────────────────
//
// Both SmallGroup (flat schedule scalars) and BreakoutGroup (a schedules[]
// relation) adapt into this before rendering, so the presentation lives in one
// place regardless of which entity — or which fetch/authz — produced it.

export type GroupDetailScheduleSlot = {
  dayOfWeek: number
  timeStart: string
  timeEnd: string | null
}

export type GroupDetailMember = {
  id: string
  name: string
  badge?: string | null
}

export type GroupDetailData = {
  name: string
  /** Regular/Couples for small groups; null for breakout groups (no type). */
  groupType?: "Regular" | "Couples" | null
  /** e.g. "Led by Jane Cruz" or facilitator info; null → no subtitle. */
  subtitle: string | null
  lifeStages: string[]
  genderFocus: "Male" | "Female" | "Mixed" | null
  language: string[]
  locationCity: string | null
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  schedules: GroupDetailScheduleSlot[]
  memberLimit: number | null
  currentCount: number
  /** Section label for the roster — "Members" for small groups, "Assigned" for
   *  breakouts. */
  membersLabel: string
  members: GroupDetailMember[]
}

const MEETING_FORMAT_LABEL: Record<string, string> = {
  Online: "Online",
  Hybrid: "Hybrid",
  InPerson: "In Person",
}

// ─── GroupDetailSheet ─────────────────────────────────────────────────────────

export function GroupDetailSheet({
  data,
  loading,
  open,
  onOpenChange,
}: {
  data: GroupDetailData | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
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
            <SheetHeader className="relative overflow-hidden">
              {data.groupType === "Couples" && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 animate-in fade-in duration-1000"
                >
                  <div className="couples-accent-breathe h-full w-full bg-linear-to-br from-rose-200/50 via-rose-100/20 via-30% to-transparent to-60% dark:from-rose-500/15 dark:via-rose-500/6 dark:to-transparent" />
                </div>
              )}
              <SheetTitle className="relative">{data.name}</SheetTitle>
              {data.subtitle && (
                <SheetDescription className="relative">{data.subtitle}</SheetDescription>
              )}
            </SheetHeader>

            <div className="px-4 space-y-6">
              {/* Details */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Details
                </h3>
                <div className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Life Stage</span>
                  <span>{data.lifeStages.length > 0 ? data.lifeStages.join(", ") : "—"}</span>
                  <span className="text-muted-foreground">Gender Focus</span>
                  <span>{data.genderFocus ?? "—"}</span>
                  <span className="text-muted-foreground">Language</span>
                  <span>{data.language.length > 0 ? data.language.join(", ") : "—"}</span>
                  <span className="text-muted-foreground">Location</span>
                  <span>{data.locationCity ?? "—"}</span>
                  <span className="text-muted-foreground">Format</span>
                  <span>
                    {data.meetingFormat ? MEETING_FORMAT_LABEL[data.meetingFormat] ?? data.meetingFormat : "—"}
                  </span>
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Schedule
                </h3>
                {data.schedules.length > 0 ? (
                  <ul className="space-y-0.5">
                    {data.schedules.map((s, i) => (
                      <li key={`${s.dayOfWeek}-${s.timeStart}-${i}`} className="text-sm">
                        {formatSchedule(s.dayOfWeek, s.timeStart, s.timeEnd)}
                      </li>
                    ))}
                  </ul>
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
                  {data.currentCount} / {data.memberLimit != null ? data.memberLimit : "No limit"} members
                </p>
              </div>

              {/* Members */}
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {data.membersLabel}
                </h3>
                {data.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members yet</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between text-sm">
                        <span>{m.name}</span>
                        {m.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {m.badge}
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
