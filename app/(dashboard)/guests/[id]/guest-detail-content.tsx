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

type Props = {
  guest: GuestData
  lifeStages: { id: string; name: string }[]
  pipelineStatus: GuestPipelineStatus
  eventHistory: React.ReactNode
}

export function GuestDetailContent({ guest, lifeStages, pipelineStatus, eventHistory }: Props) {
  const matchSectionRef = React.useRef<GuestMatchSectionHandle>(null)

  async function handleSaveMatchingProfile() {
    await matchSectionRef.current?.save()
  }

  return (
    <GuestForm
      guest={guest}
      eventHistory={eventHistory}
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
          }}
          lifeStages={lifeStages}
        />
      }
      onSaveMatchingProfile={handleSaveMatchingProfile}
    />
  )
}
