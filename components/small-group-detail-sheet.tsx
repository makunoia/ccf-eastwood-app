"use client"

import * as React from "react"
import { toast } from "sonner"

import { getSmallGroupDetails } from "@/app/(dashboard)/guests/matching-actions"
import { GroupDetailSheet, type GroupDetailData } from "@/components/group-detail-sheet"

// ─── SmallGroupDetailSheet ────────────────────────────────────────────────────
//
// Thin wrapper: fetches a SmallGroup and adapts its flat schedule scalars into
// the normalized GroupDetailData shape rendered by GroupDetailSheet.

export function SmallGroupDetailSheet({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string | null
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
    getSmallGroupDetails(groupId).then((res) => {
      setLoading(false)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const g = res.data
      setData({
        name: g.name,
        groupType: g.groupType,
        subtitle: g.leader
          ? `Led by ${g.leader.firstName} ${g.leader.lastName}`
          : "No leader assigned",
        lifeStages: g.lifeStages.map((ls) => ls.name),
        genderFocus: g.genderFocus,
        language: g.language,
        locationCity: g.locationCity,
        meetingFormat: g.meetingFormat,
        schedules:
          g.scheduleDayOfWeek != null && g.scheduleTimeStart
            ? [{ dayOfWeek: g.scheduleDayOfWeek, timeStart: g.scheduleTimeStart, timeEnd: g.scheduleTimeEnd }]
            : [],
        memberLimit: g.memberLimit,
        currentCount: g.currentCount,
        membersLabel: "Members",
        members: g.members.map((m) => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          badge: m.groupStatus,
        })),
      })
    })
  }, [open, groupId])

  return <GroupDetailSheet data={data} loading={loading} open={open} onOpenChange={onOpenChange} />
}
