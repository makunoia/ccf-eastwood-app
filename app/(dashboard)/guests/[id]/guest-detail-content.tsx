"use client"

import * as React from "react"
import { GuestForm } from "../guest-form"
import { GuestMatchSection, type GuestMatchSectionHandle } from "./guest-match-section"
import type { GuestPipelineStatus } from "@/lib/guest-utils"

type GuestData = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  lifeStageId: string | null
  gender: string | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  memberId: string | null
  claimedSmallGroup: {
    id: string
    name: string
    leader: { id: string; firstName: string; lastName: string } | null
  } | null
  pendingGroupName: string | null
  pendingGroupId: string | null
  matchedBreakout: {
    eventName: string
    breakoutGroupName: string
    facilitatorName: string | null
    linkedSmallGroup: {
      name: string
      leader: { firstName: string; lastName: string } | null
    } | null
  } | null
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number)
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

type Props = {
  guest: GuestData
  lifeStages: { id: string; name: string }[]
  pipelineStatus: GuestPipelineStatus
  sourceEvent?: { id: string; name: string; date: Date } | null
  eventHistory: React.ReactNode
  activityHistory: React.ReactNode
}

export function GuestDetailContent({ guest, lifeStages, pipelineStatus, sourceEvent, eventHistory, activityHistory }: Props) {
  const matchSectionRef = React.useRef<GuestMatchSectionHandle>(null)

  async function handleSaveMatchingProfile() {
    await matchSectionRef.current?.save()
  }

  return (
    <GuestForm
      guest={guest}
      sourceEvent={sourceEvent}
      eventHistory={eventHistory}
      activityHistory={activityHistory}
      matchSection={
        <GuestMatchSection
          ref={matchSectionRef}
          guestId={guest.id}
          pipelineStatus={pipelineStatus}
          claimedGroup={guest.claimedSmallGroup}
          pendingGroupName={guest.pendingGroupName}
          pendingGroupId={guest.pendingGroupId}
          matchedBreakout={guest.matchedBreakout}
          initialPrefs={{
            lifeStageId: guest.lifeStageId ?? "",
            gender: guest.gender ?? "",
            language: guest.language,
            workCity: guest.workCity ?? "",
            workIndustry: guest.workIndustry ?? "",
            meetingPreference: guest.meetingPreference ?? "",
            scheduleDayOfWeek:
              guest.scheduleDayOfWeek != null ? String(guest.scheduleDayOfWeek) : "",
            scheduleTimeStart: guest.scheduleTimeStart ?? "",
            scheduleTimeEnd: guest.scheduleTimeStart ? addOneHour(guest.scheduleTimeStart) : "",
          }}
          lifeStages={lifeStages}
        />
      }
      onSaveMatchingProfile={handleSaveMatchingProfile}
    />
  )
}
