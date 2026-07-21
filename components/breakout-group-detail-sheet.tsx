"use client"

import * as React from "react"
import { toast } from "sonner"

import { getBreakoutGroupDetails } from "@/app/(dashboard)/events/matching-actions"
import { GroupDetailSheet, type GroupDetailData } from "@/components/group-detail-sheet"

// ─── BreakoutGroupDetailSheet ─────────────────────────────────────────────────
//
// Thin wrapper: fetches an event-scoped BreakoutGroup and adapts it into the
// normalized GroupDetailData shape. Separate from SmallGroupDetailSheet because
// the fetch is genuinely different — event-scoped authz and a schedules[]
// relation rather than flat scalars.

export function BreakoutGroupDetailSheet({
  groupId,
  eventId,
  open,
  onOpenChange,
}: {
  groupId: string | null
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [data, setData] = React.useState<GroupDetailData | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open || !groupId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null)
    setLoading(true)
    getBreakoutGroupDetails(groupId, eventId).then((res) => {
      setLoading(false)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const g = res.data
      const facilitators = [g.facilitator, g.coFacilitator]
        .filter((f): f is { firstName: string; lastName: string } => f != null)
        .map((f) => `${f.firstName} ${f.lastName}`)
      setData({
        name: g.name,
        subtitle: facilitators.length > 0 ? `Facilitated by ${facilitators.join(" & ")}` : null,
        lifeStages: g.lifeStages.map((ls) => ls.name),
        genderFocus: g.genderFocus,
        language: g.language,
        locationCity: g.locationCity,
        meetingFormat: g.meetingFormat,
        schedules: g.schedules,
        memberLimit: g.memberLimit,
        currentCount: g.currentCount,
        membersLabel: "Assigned",
        members: g.members.map((m) => ({ id: m.id, name: m.name })),
      })
    })
  }, [open, groupId, eventId])

  return <GroupDetailSheet data={data} loading={loading} open={open} onOpenChange={onOpenChange} />
}
